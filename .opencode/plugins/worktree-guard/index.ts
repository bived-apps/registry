// Bive's guard, the OpenCode 2 plugin: before any tool runs, check.ts decides (README › Files, AGENTS.md › Rules).
// `ctx.location.directory` is this session's directory. The session is a delegate's when BIVE_ROLE=delegate, when
// that directory is `.worktrees/issue-<n>`, when it holds `.bive/state/role` saying `delegate` (the coordinator
// writes it at start), or, per call, when the tool event's `agent` is `delegate` (0.2 part 2: an API-created session
// has no variable and may sit in any worktree). Advisors (including legacy supervisor markers) are read-only:
// no shell, writes or workflow operations. A child session runs in its parent's instance and environment: its writes and shell
// `workdir` in `.worktrees/issue-<n>/` are checked as that delegate's, but a delegate session elsewhere, with neither
// the variable nor the role file, fails open (treated as the coordinator). A refusal is a thrown error, which the
// model reads and must work around inside its worktree. `@opencode/plugin` is supplied by OpenCode itself.
import fs from "node:fs"
import path from "node:path"
import { Plugin } from "@opencode/plugin"
import { isDelegate, isAdvisor, makeGuard } from "./check.ts"
import { registerCoordinatorMerge } from "./merge-tool.ts"

// The role file's text; undefined when there is none. Unreadable for another reason: "delegate" (fail closed).
function roleFile(root: string): string | undefined {
  try {
    return fs.readFileSync(path.join(root, ".bive", "state", "role"), "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined
    console.warn(`worktree-guard: .bive/state/role unreadable (${e}); this session is treated as a delegate's`)
    return "delegate"
  }
}

export default Plugin.define({
  id: "bive.worktree-guard",
  async setup(ctx) {
    const root = ctx.location.directory
    const role = process.env.BIVE_ROLE, file = roleFile(root)
    await registerCoordinatorMerge(ctx, root, role, file)
    // Two guards, chosen per call: the tool event carries the session's agent (verified on OpenCode 2.2.5: keys tool,
    // sessionID, agent, messageID, id, input), so a session whose agent is `delegate` is a delegate's even with no
    // BIVE_ROLE and a worktree not named issue-<n>. Both are cached: makeGuard is built once each.
    const advisorSession = isAdvisor(role, file)
    const guards = { plain: makeGuard({ root, delegate: isDelegate(root, role, file), advisor: advisorSession }),
                      delegate: makeGuard({ root, delegate: true }),
                      advisor: makeGuard({ root, delegate: isDelegate(root, role, file), advisor: true }) }
    await ctx.tool.hook("execute.before", (event) => {
      const input = (event.input ?? {}) as Record<string, unknown>
      const agent = typeof (event as { agent?: unknown }).agent === "string" ? (event as { agent: string }).agent : undefined
      const check = isAdvisor(role, file, agent) ? guards.advisor
        : isDelegate(root, role, file, agent) ? guards.delegate : guards.plain
      check(event.tool, input)
    })
  },
})
