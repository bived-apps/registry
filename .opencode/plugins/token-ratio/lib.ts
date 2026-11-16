// token-ratio's pure helpers: no OpenCode import, so `node --test tests/*.test.ts` exercises them; index.ts is the plugin.
import { readFileSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"

// 48213 -> 48000: a size, not a fingerprint (two significant figures; below 100, the number itself).
export function twoDigits(n: number): number {
  if (n < 100) return n
  const p = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / p) * p
}

// Lines of the tracked text files of a checkout (binaries and files over 2 MB skipped).
export function codeLines(root: string): number {
  let lines = 0
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 << 20, timeout: 30_000 })
    .toString().split("\0")
  for (const f of files) {
    if (!f) continue
    try {
      const full = path.join(root, f)
      if (statSync(full).size > 2 << 20) continue
      const text = readFileSync(full, "utf8")
      if (text.includes("\0")) continue          // binary
      lines += text.split("\n").length
    } catch { /* deleted or unreadable since `git ls-files`: not counted */ }
  }
  return lines
}

// The main checkout of a worktree (where .bive/state/ lives, shared by every worktree); the directory itself when
// it is not a git checkout.
export function mainCheckout(dir: string): string {
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"],
                                { cwd: dir, timeout: 10_000 })
    return path.dirname(common.toString().trim())
  } catch {
    return dir
  }
}

// Whether a session belongs to this plugin instance: OpenCode loads one instance per location, and every instance
// receives every session's events. Exact directory match: a sub-folder or a worktree has its own instance, and
// counting it here too would count it twice in the shared tokens.jsonl. An unknown directory is not ours.
export function ownSession(sessionDirectory: string | undefined, root: string): boolean {
  if (!sessionDirectory) return false
  return path.resolve(sessionDirectory) === path.resolve(root)
}

// Totals of a tokens.jsonl log: human and agent tokens and their ratio (null before the first human token).
// A corrupt line is skipped: the file is appended by several processes and may be cut.
export function totals(log: string): { human: number, agent: number, ratio: number | null } {
  let human = 0, agent = 0
  for (const line of log.split("\n")) {
    if (!line) continue
    let r: { kind?: string, tokens?: number }
    try { r = JSON.parse(line) } catch { continue }
    if (typeof r.tokens !== "number") continue
    if (r.kind === "human") human += r.tokens
    else if (r.kind === "agent") agent += r.tokens
  }
  return { human, agent, ratio: human ? Math.round(agent / human) : null }
}

// The one line said when the registry report fails (#261): it names the registry, so an anonymous Cloudflare 403 is
// not mistaken for a model provider's refusal; a 401/403 points to the Worker's side (`wrangler whoami`, then
// `wrangler login`). Nothing is retried here: the counts wait for the next session end.
export function registryFailureMessage(detail: string): string {
  const auth = /\b(401|403)\b|authenticat|attention required/i.test(detail)
  return `Bive registry report (token counter, not the model) not sent: ${detail}; retried at the next session end.` +
    (auth ? " A 401/403 or a Cloudflare 'Attention Required' page comes from the registry Worker's side: check with" +
      " `wrangler whoami`, reconnect with `wrangler login` (docs/REGISTRY.md › Troubleshooting)." : "")
}

// Issue #376: the registry counts per Bive role and canonical model, not per OpenCode agent and route.
const ROLES = new Set(["coordinator", "delegate", "advisor"])

// The session's Bive role, from the signals the guard reads (docs/ROLE-START.md): its agent when that is a Bive one,
// else BIVE_ROLE, else the role file `.bive/state/role` of its directory, else a `.worktrees/issue-<n>` directory (a
// delegate). Without any, the OpenCode agent name stays (the registry shows it as "other"), or "unknown".
export function biveRole(agent: string, envRole: string | undefined, roleFile: string | undefined,
                         directory: string): string {
  for (const v of [agent, envRole, roleFile?.trim()]) if (v && ROLES.has(v)) return v
  if (/[\\/]\.worktrees[\\/]issue-\d+$/.test(path.resolve(directory))) return "delegate"
  return agent || "unknown"
}

// The canonical model of a route, through the local alias file `.bive/state/models.local.json` read backwards
// ({"aliases": {canonical: route}}, docs/PROVIDERS.md). The file wins. Without a match, a `claude-agent/` route still
// gets Anthropic's name: a versioned id (`claude-agent/claude-opus-5`) maps to `anthropic/<id>`, and a short name
// through CLAUDE_AGENT_SHORT. Any other unknown route, or an unreadable file, gives the route back.
// The claude-agent provider's short names, as it labels them (checked 2026-11-16: Opus 5.5, Sonnet 5.5, Haiku 5.5,
// Fable 5.2). When a family gets a new version, update this table and its test in the same commit.
export const CLAUDE_AGENT_SHORT: Record<string, string> = {
  opus: "anthropic/claude-opus-5-5", sonnet: "anthropic/claude-sonnet-5-5",
  haiku: "anthropic/claude-haiku-5-5", fable: "anthropic/claude-fable-5-2",
}
export function canonicalModel(route: string, aliasesText: string | undefined): string {
  if (!route) return route
  if (aliasesText) {
    try {
      const aliases = (JSON.parse(aliasesText) as { aliases?: Record<string, unknown> }).aliases ?? {}
      for (const [canonical, alias] of Object.entries(aliases)) if (alias === route) return canonical
    } catch {
      // A corrupt alias file is the owner's to fix; fall through to the built-in names.
    }
  }
  const m = /^claude-agent\/(.+)$/.exec(route)
  if (!m) return route
  if (m[1].startsWith("claude-")) return `anthropic/${m[1]}`
  return CLAUDE_AGENT_SHORT[m[1]] ?? route
}

// The guard's refusals not yet reported, claimed once per process. The worktree-guard plugin counts every refusal in
// one process-wide counter (`__biveViolations`); the reported part must be process-wide too, or each new session's
// plugin instance would start at 0 and report the whole running total again (a field report: 230 refusals reported as
// about 10,000 when some sixty sessions shared one process). Returns the new refusals and marks them reported.
export type ViolationCounters = { __biveViolations?: number, __biveViolationsReported?: number }
export function claimViolations(g: ViolationCounters): number {
  const total = g.__biveViolations ?? 0
  const reported = g.__biveViolationsReported ?? 0
  const fresh = total > reported ? total - reported : 0
  g.__biveViolationsReported = Math.max(total, reported)
  return fresh
}
