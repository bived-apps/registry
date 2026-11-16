// Close same-repository issues whose closing reference was merged into an integration branch
// (`bived` or `milestone/<name>`), when the merge commit is reachable from that base. Conservative:
// ambiguous references stay open; idempotent via a provenance marker comment (issue #229).
// This script reads only the pull request body and event metadata; it never checks out or runs head code.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isIntegrationBranch } from "./merge-gate-lib.mjs"

const GH_TIMEOUT_MS = 30_000
// Same idempotency marker the comment carries; a rerun skips any issue already holding it.
export function closureMarker(prNumber, sha) {
  return `<!-- bive-close-issues pr=${prNumber} sha=${sha} -->`
}

// One keyword per line and only the first reference counts, as in lib/closing-issues.ts (issue #117);
// the rules are restated here rather than imported because this script must run in a workflow without
// a TypeScript loader. This parser additionally ignores fenced code blocks, inline code, blockquotes,
// `Part of`, and references to a repository other than `repo` (owner/repo#N or a github.com issues URL).
// When unsure, the line is ignored.
const CLOSING_KEYWORD_LINE = /^\s*\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s+(.+)$/i
const PART_OF_LINE = /^\s*\bpart\s+of\b/i
const FENCE_LINE = /^\s*(?:```|~~~)/
const BLOCKQUOTE_LINE = /^\s*>/
const INLINE_CODE_SPAN = /`[^`\n]*`/g
// First reference on the line: `owner/repo#N`, a github.com issues URL, or a plain `#N` (same repository).
const REFERENCE = /(?:([\w.-]+)\/([\w.-]+))?#(\d+)|https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/gi

function referenceRepository(ref) {
  if (ref.owner !== null && ref.name !== null) return `${ref.owner}/${ref.name}`.toLowerCase()
  return null // a plain `#N` is always same-repository on GitHub
}

function sameRepository(ref, repo) {
  const refRepo = referenceRepository(ref)
  if (refRepo === null) return true
  if (typeof repo !== "string" || !repo) return false // no repo to compare against: unsure, ignore
  return refRepo === repo.toLowerCase()
}

function firstReference(lineRest) {
  REFERENCE.lastIndex = 0
  const m = REFERENCE.exec(lineRest)
  if (!m) return null
  if (m[4] !== undefined && m[5] !== undefined && m[6] !== undefined) {
    return { owner: m[4], name: m[5], number: Number(m[6]) }
  }
  if (m[1] !== undefined && m[2] !== undefined && m[3] !== undefined) {
    return { owner: m[1], name: m[2], number: Number(m[3]) }
  }
  return { owner: null, name: null, number: Number(m[3]) }
}

export function parseClosingRefs(body, { repo } = {}) {
  const seen = new Set()
  const out = []
  if (typeof body !== "string") return out
  let inFence = false
  for (const line of body.split(/\r?\n/)) {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (BLOCKQUOTE_LINE.test(line)) continue
    const noCode = line.replace(INLINE_CODE_SPAN, " ")
    if (noCode.includes("`")) continue // unpaired backtick: inline-code state is unclear, ignore the line
    if (PART_OF_LINE.test(noCode)) continue
    const keyword = noCode.match(CLOSING_KEYWORD_LINE)
    if (!keyword) continue
    const ref = firstReference(keyword[1])
    if (!ref) continue // keyword without a reference on the line: nothing to close
    if (!sameRepository(ref, repo)) continue // foreign-repository reference: GitHub closes it there, not here
    if (!Number.isInteger(ref.number) || ref.number <= 0) continue
    if (seen.has(ref.number)) continue
    seen.add(ref.number)
    out.push(ref.number)
  }
  return out
}

// Only a pull_request closed with merged === true and an integration base triggers closures.
export function shouldHandle(event) {
  const pr = event?.pull_request
  if (event?.action !== "closed") return false
  if (pr?.merged !== true) return false
  return isIntegrationBranch(pr?.base?.ref)
}

export function buildClosureComment({ prNumber, base, sha }) {
  return [
    `This issue's closing reference was completed by pull request #${prNumber}, merged into \`${base}\``
      + ` (merge commit \`${sha}\`). Closing as completed.`,
    "",
    closureMarker(prNumber, sha),
    "",
    "— bive-close-issues workflow (GitHub Actions)",
    "",
  ].join("\n")
}

// Pure plan: same-repository (refs are pre-filtered), currently open issues only, and only when the
// merge commit is reachable from the base. An issue that already carries this run's provenance marker
// is skipped, so reruns create neither duplicate comments nor extra state changes.
export function planClosures({ event, refs, issueStates, mergeCommitReachable, existingComments = {} }) {
  const pr = event?.pull_request
  const prNumber = pr?.number
  const sha = pr?.merge_commit_sha
  const base = pr?.base?.ref
  if (!Number.isInteger(prNumber) || typeof sha !== "string" || !sha
      || typeof base !== "string" || !Array.isArray(refs)) return []
  if (mergeCommitReachable !== true) return []
  const planned = new Set()
  const out = []
  for (const issue of refs) {
    if (!Number.isInteger(issue) || planned.has(issue)) continue
    if (issueStates?.[issue] !== "open") continue
    planned.add(issue)
    // A marker on a still-open issue means an earlier run commented and was interrupted before closing: close it
    // without a second comment. A closed issue is already skipped above, so a rerun changes nothing.
    const commented = hasClosureMarker(existingComments[issue], prNumber, sha)
    out.push({ issue, comment: commented ? null : buildClosureComment({ prNumber, base, sha }) })
  }
  return out
}

function hasClosureMarker(existing, prNumber, sha) {
  const text = String(existing ?? "")
  if (!text) return false
  const escapedSha = sha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`<!--\\s*bive-close-issues\\s+pr=${prNumber}\\s+sha=${escapedSha}\\s*-->`).test(text)
}

// Collects the data the plan needs and applies it. Never throws on gh failures: it returns an empty
// plan with a reason instead, so an API timeout leaves no partial state. The `runGh` dependency is
// injectable (tests); it takes (args, options) and returns { stdout }, synchronously or a promise.
export async function run({ event, repository, runGh, dryRun = false }) {
  if (!shouldHandle(event)) return { closures: [], applied: [], reason: "event is not a merged pull request into an integration branch" }
  const pr = event.pull_request
  const prNumber = pr.number
  const base = pr.base?.ref
  const sha = pr.merge_commit_sha
  if (!Number.isInteger(prNumber) || typeof base !== "string" || typeof sha !== "string" || !sha) {
    return { closures: [], applied: [], reason: "event lacks a usable pull request number, base ref, or merge SHA" }
  }
  const refs = parseClosingRefs(typeof pr.body === "string" ? pr.body : "", { repo: repository })
  if (refs.length === 0) return { closures: [], applied: [], reason: "no same-repository closing reference in the body" }

  let compareStatus = null
  try {
    compareStatus = (await runGh(["api", `repos/${repository}/compare/${base}...${sha}`, "--jq", ".status"])).stdout.trim()
  } catch (error) {
    return { closures: [], applied: [], reason: `reachability check failed: ${error.message}` }
  }
  // `behind` and `identical` mean the base ref contains the merge commit; anything else is unsure.
  const mergeCommitReachable = compareStatus === "behind" || compareStatus === "identical"
  if (!mergeCommitReachable) {
    return { closures: [], applied: [], reason: `merge commit is not reachable from the base (compare status: ${compareStatus})` }
  }

  const issueStates = {}
  const existingComments = {}
  for (const issue of refs) {
    try {
      issueStates[issue] = (await runGh(["api", `repos/${repository}/issues/${issue}`, "--jq",
        'if .pull_request then "pull_request" else .state end'])).stdout.trim() // a pull request number is never closed here
      existingComments[issue] = (await runGh(["api", `repos/${repository}/issues/${issue}/comments`, "--paginate",
        "--jq", ".[].body"])).stdout
    } catch (error) {
      return { closures: [], applied: [], reason: `reading issue #${issue} failed: ${error.message}` }
    }
  }

  const closures = planClosures({ event, refs, issueStates, mergeCommitReachable, existingComments })
  if (dryRun) return { closures, applied: [], reason: `dry run: ${closures.length} closure(s) planned, nothing changed` }
  const applied = []
  for (const { issue, comment } of closures) {
    // Comment first, then close: a failure between the two leaves the issue open and a marker behind,
    // which the next run skips — never a closed issue without its provenance comment.
    if (comment !== null) {
      await runGh(["issue", "comment", String(issue), "--repo", repository, "--body-file", "-"], { input: comment })
    }
    await runGh(["api", "-X", "PATCH", `repos/${repository}/issues/${issue}`, "-f", "state=closed"])
    applied.push(issue)
  }
  return { closures, applied, reason: `${applied.length} issue(s) closed` }
}

// Every gh call is a bounded execFileSync with a 30 s timeout; nothing is checked out and no head code runs.
function makeGhRunner(timeoutMs = GH_TIMEOUT_MS) {
  return (args, options = {}) => ({
    stdout: execFileSync("gh", args, {
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      input: options.input,
      stdio: ["pipe", "pipe", "pipe"],
    }),
  })
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not set")
  const event = JSON.parse(readFileSync(eventPath, "utf8"))
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) throw new Error("GITHUB_REPOSITORY is not set")
  const result = await run({ event, repository, runGh: makeGhRunner(), dryRun: process.env.DRY_RUN === "1" })
  console.log(`bive-close-issues: ${result.reason}`)
  if (result.closures.length > 0) {
    console.log(`bive-close-issues: planned ${JSON.stringify(result.closures.map((c) => c.issue))}`)
  }
  if (result.reason.startsWith("reachability check failed:")
      || result.reason.startsWith("reading issue #")) {
    console.error(`bive-close-issues: ${result.reason}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`bive-close-issues: ${error.message}`)
    process.exitCode = 1
  })
}
