import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyParentApproval } from "./coordinator-approval-lib.mjs"
import { AUTHORIZATION_LABEL_PREFIX, OVERRIDE_LABEL_PREFIX, evaluateMergeGate, isIntegrationBranch, parseGateOwner, parseSkippable, validateMergeAuthorization } from "./merge-gate-lib.mjs"

const GH_TIMEOUT_MS = 15_000
const OWN_CHECK = "bive-merge-gate / merge-gate"
const REQUIRED_CHECKS = ["bive-tests / tests", "bive-inviolable / check"]

function runGh(args, timeoutMs = GH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile("gh", args, { timeout: timeoutMs, maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error && error.code !== 8) {
        reject(new Error(`gh ${args.join(" ")} failed: ${(stderr || error.message).trim()}`, { cause: error }))
        return
      }
      resolve({ stdout, exitCode: error ? error.code : 0 })
    })
  })
}

function parseJson(stdout, subject) {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`gh returned invalid JSON for ${subject}`, { cause: error })
  }
}

function parseChecks(stdout) {
  const data = parseJson(stdout, "pull request checks")
  if (!Array.isArray(data)) throw new Error("gh returned an invalid pull request checks list")
  return data.map((check) => {
    if (typeof check?.workflow !== "string" || typeof check?.name !== "string"
        || typeof check?.bucket !== "string") {
      throw new Error("gh returned a check without workflow, name, or bucket")
    }
    return { workflow: check.workflow, name: check.name, bucket: check.bucket }
  })
}

export function createGhReaders(runProcess = runGh) {
  return {
    async readPullRequest({ number, repository }) {
      const { stdout, exitCode } = await runProcess([
        "pr", "view", String(number), "--repo", repository, "--json", "baseRefName,headRefOid,labels",
      ], GH_TIMEOUT_MS)
      if (exitCode !== 0) throw new Error(`gh pr view exited with status ${exitCode}`)
      const data = parseJson(stdout, "pull request")
      if (typeof data?.baseRefName !== "string" || typeof data?.headRefOid !== "string"
          || !Array.isArray(data?.labels)) {
        throw new Error("gh returned an invalid pull request record")
      }
      const labels = data.labels.map((label) => label?.name)
      if (labels.some((label) => typeof label !== "string")) throw new Error("gh returned an invalid pull request label")
      return { baseRefName: data.baseRefName, headRefOid: data.headRefOid, labels }
    },

    async readChecks({ number, repository }) {
      const { stdout, exitCode } = await runProcess([
        "pr", "checks", String(number), "--repo", repository, "--json", "workflow,name,bucket,state",
      ], GH_TIMEOUT_MS)
      if (exitCode !== 0 && exitCode !== 8) throw new Error(`gh pr checks exited with status ${exitCode}`)
      return parseChecks(stdout)
    },

    async readLabelEvents({ number, repository, label }) {
      const { stdout, exitCode } = await runProcess([
        "api", `repos/${repository}/issues/${number}/events`, "--paginate",
      ], GH_TIMEOUT_MS)
      if (exitCode !== 0) throw new Error(`gh api events exited with status ${exitCode}`)
      const data = parseJson(stdout, "pull request events")
      if (!Array.isArray(data)) throw new Error("gh returned an invalid pull request events list")
      return data.filter((event) => event?.event === "labeled" && event?.label?.name === label)
        .map((event) => ({
          event: event.event,
          label: event.label?.name,
          actor: event.actor?.login,
          actorType: event.actor?.type,
          performedViaApp: event.performed_via_github_app ?? null,
          createdAt: event.created_at,
        }))
    },

    // `.bive/gate.json` as it is on the BASE branch (a pull request cannot list its own skips): its text, or null when
    // it is missing or unreadable, which means the strict rule (issue #200).
    async readGateConfig({ repository, ref }) {
      try {
        const { stdout, exitCode } = await runProcess([
          "api", `repos/${repository}/contents/.bive/gate.json?ref=${encodeURIComponent(ref)}`, "--jq", ".content",
        ], GH_TIMEOUT_MS)
        if (exitCode !== 0) return null
        return Buffer.from(stdout.trim(), "base64").toString("utf8")
      } catch {
        return null
      }
    },

    // Context for a parent approval (#262): the PR's head branch, origin, state and changed files.
    async readParentContext({ number, repository }) {
      const { stdout } = await runProcess(["pr", "view", String(number), "--repo", repository, "--json",
        "headRefName,isCrossRepository,state,files"], GH_TIMEOUT_MS)
      const data = parseJson(stdout, "pull request context")
      return { headBranch: data?.headRefName, sameRepository: data?.isCrossRepository === false, state: data?.state,
        files: Array.isArray(data?.files) ? data.files.map((f) => f?.path) : null }
    },

    async readComments({ number, repository }) {
      const { stdout } = await runProcess(["api", `repos/${repository}/issues/${number}/comments`, "--paginate",
        "--jq", ".[] | {body: .body}"], GH_TIMEOUT_MS)
      return stdout.split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line) } catch { return {} } })
    },

    async readRepositoryOwner({ repository }) {
      const { stdout, exitCode } = await runProcess([
        "api", `repos/${repository}`, "--jq", ".owner.login",
      ], GH_TIMEOUT_MS)
      if (exitCode !== 0) throw new Error(`gh api repository exited with status ${exitCode}`)
      const owner = stdout.trim()
      if (!owner) throw new Error("gh returned an empty repository owner")
      return owner
    },
  }
}

function identity(check) {
  return `${check.workflow} / ${check.name}`
}

function checksArePending(checks) {
  const visible = checks.filter((check) => identity(check) !== OWN_CHECK)
  if (visible.some((check) => check.bucket === "pending")) return true
  return REQUIRED_CHECKS.some((required) => visible.filter((check) => identity(check) === required).length === 0)
}

export async function runMergeGate({
  event,
  repository,
  readPullRequest,
  readChecks,
  readLabelEvents = null,
  readRepositoryOwner = null,
  readGateConfig = null,
  readParentContext = null,
  readComments = null,
  now = Date.now,
}) {
  const request = event?.pull_request
  if (!Number.isInteger(request?.number) || typeof request?.head?.sha !== "string"
      || typeof request?.base?.ref !== "string") {
    throw new Error("event does not contain a pull request number, head SHA, and base branch")
  }
  if (!isIntegrationBranch(request.base.ref)) {
    throw new Error("merge gate only runs for pull requests targeting bived or milestone/<name>")
  }

  const pr = await readPullRequest({ number: request.number, repository })
  if (pr.baseRefName !== request.base.ref) throw new Error("pull request base changed; refusing stale merge-gate run")
  if (pr.headRefOid !== request.head.sha) throw new Error("pull request head changed; refusing stale merge-gate run")

  // `.bive/gate.json` of the base, read once: the named owner (#249) and the skippable checks (#200).
  let gateConfig = null
  if (readGateConfig) {
    try { gateConfig = await readGateConfig({ repository, ref: pr.baseRefName }) } catch { gateConfig = null }
  }
  const namedOwner = parseGateOwner(gateConfig)

  // Resolve the owner identity and the applying event for the authorization label.
  let owner = null
  let labelAppliedAt = null
  let labelAppliedBy = null
  let labelActorType = null
  let labelPerformedViaApp = null
  const authLabel = (pr.labels || []).find((l) => l.startsWith(AUTHORIZATION_LABEL_PREFIX))
  if (authLabel) {
    if (namedOwner) owner = namedOwner
    else if (readRepositoryOwner) {
      try { owner = await readRepositoryOwner({ repository }) } catch { owner = null }
    }
    if (readLabelEvents) {
      try {
        const events = await readLabelEvents({ number: request.number, repository, label: authLabel })
        if (Array.isArray(events) && events.length > 0) {
          const latest = events.reduce((a, b) => (new Date(a.createdAt) >= new Date(b.createdAt) ? a : b))
          labelAppliedAt = latest.createdAt
          labelAppliedBy = latest.actor
          labelActorType = latest.actorType
          labelPerformedViaApp = latest.performedViaApp
        }
      } catch { /* leave null; new checks skipped for backward compat */ }
    }
  }

  // Override label (optional): relaxes pending/missing checks, never red checks.
  let overrideAppliedAt = null
  let overrideAppliedBy = null
  let overrideActorType = null
  let overridePerformedViaApp = null
  let overrideOwner = owner
  const overrideLabel = (pr.labels || []).find((l) => l.startsWith(OVERRIDE_LABEL_PREFIX))
  if (overrideLabel) {
    if (namedOwner && !overrideOwner) overrideOwner = namedOwner
    if (readRepositoryOwner && !overrideOwner) {
      try { overrideOwner = await readRepositoryOwner({ repository }) } catch { overrideOwner = null }
    }
    if (readLabelEvents) {
      try {
        const events = await readLabelEvents({ number: request.number, repository, label: overrideLabel })
        if (Array.isArray(events) && events.length > 0) {
          const latest = events.reduce((a, b) => (new Date(a.createdAt) >= new Date(b.createdAt) ? a : b))
          overrideAppliedAt = latest.createdAt
          overrideAppliedBy = latest.actor
          overrideActorType = latest.actorType
          overridePerformedViaApp = latest.performedViaApp
        }
      } catch { /* leave null */ }
    }
  }

  // No dated label: a signed parent approval of this exact head under the owner's grant on the base may stand in (#262).
  let parentApproved = false
  if (!authLabel && !overrideLabel && gateConfig && readParentContext && readComments) {
    try {
      const context = await readParentContext({ number: request.number, repository })
      const comments = await readComments({ number: request.number, repository })
      parentApproved = Boolean(verifyParentApproval(gateConfig, { repository, number: request.number, head: pr.headRefOid,
        base: pr.baseRefName, headBranch: context.headBranch, coordinatorPR: (pr.labels || []).includes("coordinator"),
        sameRepository: context.sameRepository, state: context.state, files: context.files }, comments, now()))
    } catch { parentApproved = false }
  }

  const authorization = parentApproved ? { ok: true } : validateMergeAuthorization({ labels: pr.labels, baseRef: pr.baseRefName, now: now(),
    labelAppliedAt, labelAppliedBy, owner, labelActorType, labelPerformedViaApp,
    overrideAppliedAt, overrideAppliedBy, overrideOwner, overrideActorType, overridePerformedViaApp })
  if (!authorization.ok) throw new Error(authorization.reason)

  const checks = await readChecks({ number: request.number, repository })
  const override = (pr.labels || []).some((l) => l.startsWith(OVERRIDE_LABEL_PREFIX))
  if (checksArePending(checks) && !override) {
    throw new Error("required CI checks have not finished yet; the gate runs again when they complete")
  }

  // Refresh PR metadata after the checks read so a removed grant or updated head cannot pass on stale event data.
  const current = await readPullRequest({ number: request.number, repository })
  if (current.baseRefName !== pr.baseRefName || current.headRefOid !== pr.headRefOid) {
    throw new Error("pull request changed during merge-gate validation; refusing stale results")
  }
  const skippable = parseSkippable(gateConfig)
  const result = evaluateMergeGate({ parentApproved, labels: current.labels, baseRef: current.baseRefName, checks, now: now(), skippable,
    labelAppliedAt, labelAppliedBy, owner, labelActorType, labelPerformedViaApp,
    overrideAppliedAt, overrideAppliedBy, overrideOwner, overrideActorType, overridePerformedViaApp })
  if (!result.ok) throw new Error(result.reason)
  return result
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not set")
  const event = parseJson(readFileSync(eventPath, "utf8"), "GitHub event")
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) throw new Error("GITHUB_REPOSITORY is not set")
  const readers = createGhReaders()
  const result = await runMergeGate({ event, repository, ...readers })
  console.log(`bive-merge-gate: ${result.reason}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`bive-merge-gate: ${error.message}`)
    process.exitCode = 1
  })
}