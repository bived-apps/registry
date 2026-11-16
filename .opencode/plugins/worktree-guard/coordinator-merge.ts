// Owner opt-in execution, not supervisory authority. The shell merge denial stays in place.
// All I/O is injected so tests never authorize or perform a real merge.
export type MergeMode = "label" | "grant"
export type MergeSnapshot = {
  // label: the owner's dated label and a fresh permission prompt per merge; grant: the owner's signed grant (#344).
  mode: MergeMode
  repository: string
  number: number
  state: string
  head: string
  base: string
  headBranch: string
  sameRepository: boolean
  coordinatorPR: boolean
  enabled: boolean
  owner: string
  checks: { workflow: string, name: string, bucket: string }[]
  authorizationValid: boolean
  headApproved: boolean
  grantExpiresAt: number
  authorityChange: boolean
  executor: { id: string, agent: string }
  child: { id: string, agent: string, parentID: string, branch: string, head: string }
  selfAuthored: boolean
}

export type MergeRequest = { number: number, childSession: string }
export type MergeScope = {
  repository: string, number: number, head: string, base: string, headBranch: string
  executor: string, childSession: string, expiresAt: number
}
export type MergeIO = {
  read: () => Promise<MergeSnapshot>
  // Parent approval under an existing, protected-base owner grant; never a fresh owner grant.
  approve: (scope: MergeScope, owner: string) => Promise<void>
  // Label mode only: the owner's fresh OpenCode permission prompt for this exact scope; rejects unless answered yes.
  ask?: (scope: MergeScope, owner: string) => Promise<void>
  merge: (scope: MergeScope) => Promise<string>
  now?: () => number
}

const sha = /^[a-f0-9]{40}$/
function valid(snapshot: MergeSnapshot, request: MergeRequest, executor: string): void {
  const reject = (reason: string): never => { throw new Error(`coordinator merge refused: ${reason}`) }
  // Owner-only: no agent merges or approves into main (or any default/protected branch), whatever a grant says.
  if (snapshot.base === "main" || snapshot.base === "master") reject("main is the owner's alone; an agent never merges into it")
  if (snapshot.enabled !== true) reject("owner opt-in is off on the base branch")
  if (snapshot.authorityChange !== false) reject("owner must merge changes to authority or enforcement")
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(snapshot.repository) || !snapshot.owner) reject("repository or human owner missing")
  if (!Number.isSafeInteger(request.number) || request.number < 1 || snapshot.number !== request.number) reject("wrong PR")
  if (snapshot.state !== "OPEN" || !snapshot.sameRepository || !sha.test(snapshot.head)) reject("PR is not an open same-repository head")
  if (snapshot.coordinatorPR !== true) reject("PR is not labelled coordinator")
  if (!/^(?:bived|milestone\/[A-Za-z0-9._-]+)$/.test(snapshot.base)) reject("unsupported integration base")
  if (!executor || snapshot.executor.id !== executor || snapshot.executor.agent !== "coordinator") reject("executor is not the designated coordinator")
  if (snapshot.child.id !== request.childSession || snapshot.child.id === executor
      || snapshot.child.parentID !== executor || snapshot.child.agent !== "coordinator") reject("not a direct sub-coordinator")
  if (snapshot.child.branch !== snapshot.headBranch || snapshot.child.head !== snapshot.head) reject("sub-coordinator branch or head changed")
  if (snapshot.selfAuthored !== false) reject("executor authored work in this PR, or authorship is unknown")
  if (snapshot.authorizationValid !== true) reject("current owner authorization is missing, expired or revoked")
  if (!Number.isFinite(snapshot.grantExpiresAt)) reject("grant expiry is missing")
  for (const required of ["bive-tests / tests", "bive-inviolable / check", "bive-merge-gate / merge-gate"]) {
    const matches = snapshot.checks.filter((c) => `${c.workflow} / ${c.name}` === required)
    if (required === "bive-merge-gate / merge-gate") continue // parent's signed approval starts this check
    const allowedSkip = required === "bive-inviolable / check" && snapshot.coordinatorPR
    if (matches.length !== 1 || (matches[0].bucket !== "pass" && !(allowedSkip && matches[0].bucket === "skipping"))) {
      reject(`required check ${required} is not green`)
    }
  }
  if (snapshot.checks.some((c) => `${c.workflow} / ${c.name}` !== "bive-merge-gate / merge-gate" && c.bucket !== "pass"
      && !(`${c.workflow} / ${c.name}` === "bive-inviolable / check"
        && snapshot.coordinatorPR && c.bucket === "skipping"))) reject("a check is not green")
}

function gatePassed(snapshot: MergeSnapshot): boolean {
  const gate = snapshot.checks.filter((c) => `${c.workflow} / ${c.name}` === "bive-merge-gate / merge-gate")
  return gate.length === 1 && gate[0].bucket === "pass"
}
const knownMode = (snapshot: MergeSnapshot): MergeMode | null =>
  snapshot.mode === "label" || snapshot.mode === "grant" ? snapshot.mode : null

export async function runCoordinatorMerge(request: MergeRequest, executor: string, io: MergeIO): Promise<string> {
  const now = io.now ?? Date.now
  const first = await io.read()
  valid(first, request, executor)
  if (now() >= first.grantExpiresAt) throw new Error("coordinator merge refused: owner grant expired")
  const scope: MergeScope = { repository: first.repository, number: first.number, head: first.head, base: first.base, headBranch: first.headBranch,
    executor, childSession: request.childSession, expiresAt: Math.min(now() + 120_000, first.grantExpiresAt) }
  if (first.mode !== knownMode(first)) throw new Error("coordinator merge refused: merge mode is missing or unknown")
  if (first.mode === "label") {
    // The gate is green only on the owner's dated label at this head; the owner then answers the prompt.
    if (!gatePassed(first)) return "Waiting for the owner's dated label and bive-merge-gate on this head; invoke again once green. No merge performed."
    if (typeof io.ask !== "function") throw new Error("coordinator merge refused: no owner permission prompt available")
    await io.ask(scope, first.owner)
  } else if (!first.headApproved) await io.approve(scope, first.owner)
  if (!Number.isFinite(now()) || now() >= scope.expiresAt) throw new Error("coordinator merge refused: one-call grant expired")
  // Owner can revoke by disabling opt-in on base or removing PR authorization while the prompt is open.
  const latest = await io.read()
  valid(latest, request, executor)
  if (latest.mode !== first.mode) throw new Error("coordinator merge refused: merge mode changed")
  if (latest.repository !== scope.repository || latest.head !== scope.head || latest.base !== scope.base
      || latest.owner !== first.owner || now() >= scope.expiresAt) {
    throw new Error("coordinator merge refused: scope changed or one-call grant expired")
  }
  if (now() >= latest.grantExpiresAt) throw new Error("coordinator merge refused: owner grant expired")
  if (!latest.headApproved || !gatePassed(latest)) {
    return latest.mode === "label"
      ? "bive-merge-gate is not green on this head; no merge performed."
      : "Parent head approval recorded; wait for bive-merge-gate, then invoke again. No merge performed."
  }
  // Parent approvals never extend the owner's bounded grant. GitHub also checks the head.
  return io.merge(scope)
}
