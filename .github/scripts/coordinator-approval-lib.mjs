// Owner grants come only from the protected PR BASE. Parent head approvals are signed by the granted session key.
import { createPublicKey, verify } from "node:crypto"

export const APPROVAL_PREFIX = "<!-- bive-parent-approval:v1 -->\n"
export const APPROVAL_LIFETIME_MS = 10 * 60 * 1000
const session = /^ses_[A-Za-z0-9]+$/
const sha = /^[a-f0-9]{40}$/
const repository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const branch = /^(?:bived|milestone\/[A-Za-z0-9._-]+)$/
const approvalKeys = ["grant", "repository", "number", "head", "base", "executor", "childSession", "headBranch",
  "issuedAt", "expiresAt", "sequence"]

export function approvalBytes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== approvalKeys.length || approvalKeys.some((key) => !(key in value))) {
    throw new Error("invalid parent approval shape")
  }
  return Buffer.from(JSON.stringify(approvalKeys.map((key) => value[key])))
}

export function readCoordinatorGrants(text) {
  let policy
  try { policy = JSON.parse(text) } catch { return [] }
  if (policy?.coordinatorMerges !== true || typeof policy.owner !== "string" || !policy.owner
      || !Array.isArray(policy.coordinatorMergeGrants)) return []
  // Label mode (#344) ignores every grant: only the owner's dated label authorizes, never a signed approval.
  if (policy.coordinatorMergeMode === "label") return []
  const ids = policy.coordinatorMergeGrants.map((grant) => grant?.id)
  if (new Set(ids).size !== ids.length) return []
  return policy.coordinatorMergeGrants.filter((grant) => {
    if (!grant || typeof grant.id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(grant.id)
        || !repository.test(grant.repository) || !session.test(grant.executor) || !branch.test(grant.base)
        || !Number.isInteger(grant.maxApprovals) || grant.maxApprovals < 1 || grant.maxApprovals > 20
        || !Array.isArray(grant.children) || grant.children.length < 1 || grant.children.length > 3
        || new Set(grant.children.map((child) => child?.id)).size !== grant.children.length
        || !grant.children.every((child) => child && session.test(child.id) && child.id !== grant.executor
          && typeof child.branch === "string" && /^[A-Za-z0-9._/-]+$/.test(child.branch)
          && child.branch !== grant.base)
        || typeof grant.expiresAt !== "string" || !grant.expiresAt.endsWith("Z")
        || !Number.isFinite(Date.parse(grant.expiresAt)) || typeof grant.publicKey !== "string") return false
    try { return createPublicKey(grant.publicKey).asymmetricKeyType === "ed25519" } catch { return false }
  })
}

export function matchingGrant(text, { repository, executor, childSession, headBranch, base }, now = Date.now()) {
  const grants = readCoordinatorGrants(text).filter((grant) => grant.repository === repository
    && grant.executor === executor && grant.base === base && Date.parse(grant.expiresAt) > now
    && grant.children.some((child) => child.id === childSession && child.branch === headBranch))
  return grants.length === 1 ? grants[0] : null
}

// Never permit a delegated merge to extend/rewrite its own authority or enforcement.
export function changesMergeAuthority(files) {
  return !Array.isArray(files) || files.some((file) => typeof file !== "string"
    || file === ".bive/gate.json" || file === "AGENTS.md" || file === "opencode.jsonc"
    || file.startsWith(".bive/prompts/") || file.startsWith(".opencode/plugins/")
    || file.startsWith(".github/scripts/") || file.startsWith(".github/workflows/"))
}

export function verifyParentApproval(text, pr, comments, now = Date.now()) {
  if (!repository.test(pr?.repository) || !Number.isSafeInteger(pr?.number) || pr.number < 1
      || !sha.test(pr?.head) || !branch.test(pr?.base) || !pr.coordinatorPR
      || pr.sameRepository !== true || pr.state !== "OPEN" || changesMergeAuthority(pr.files)) return null
  if (!Array.isArray(comments)) return null
  for (const comment of comments) {
    if (typeof comment?.body !== "string" || !comment.body.startsWith(APPROVAL_PREFIX)) continue
    try {
      const envelope = JSON.parse(comment.body.slice(APPROVAL_PREFIX.length))
      const payload = envelope.payload
      const bytes = approvalBytes(payload)
      const grant = matchingGrant(text, { ...payload, childSession: payload.childSession }, now)
      if (!grant || payload.grant !== grant.id || payload.repository !== pr.repository
          || payload.number !== pr.number || payload.head !== pr.head || payload.base !== pr.base
          || payload.headBranch !== pr.headBranch || !Number.isInteger(payload.sequence)
          || payload.sequence < 1 || payload.sequence > grant.maxApprovals
          || !Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt)
          || payload.issuedAt > now || payload.expiresAt <= now || payload.expiresAt <= payload.issuedAt
          || payload.expiresAt > Date.parse(grant.expiresAt)
          || payload.expiresAt - payload.issuedAt > APPROVAL_LIFETIME_MS
          || typeof envelope.signature !== "string"
          || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature)
          || !verify(null, bytes, createPublicKey(grant.publicKey), Buffer.from(envelope.signature, "base64"))) continue
      return { grant, payload }
    } catch {
      // Comments are untrusted input. A malformed/non-signature comment is not authorization.
    }
  }
  return null
}
