# Updating a project that already uses Bive (issue #199)

The install in the README is for a project that has no Bive yet. A project that has it and wants Bive's newer rules,
prompts, plugins and gate follows these two turns instead. Copying files over is not safe: Bive's own repository holds
its own `.bive/registry-id`, and a project adapts `opencode.jsonc`, the gate and its runners, and its own prompts.

## What is never copied

| Never | Why |
| --- | --- |
| `.bive/registry-id` | It is **Bive's** id; a copy makes your project report under it (`docs/REGISTRY.md`). Keep your own file, or none: no file means no reporting. To join, use skill `bive-registry-optin`. |
| `.bive/state/` | Run-time state of your agents (briefs, role file, local model aliases, tokens). |
| `.bive/gate.json` merge opt-in, grants or old approvals | Never copy another app's `coordinatorMerges` opt-in, coordinator merge grants, or old approval state. The opt-in ships disabled (`false`) and stays disabled until the app's own owner decides. |
| `HANDOFF.md`, `ROADMAP.md`, `README.md` | They describe Bive, then your project. |
| `tests/` of Bive, `lib/` of Bive | Your tests and code are yours; Bive's tests check Bive. |
| `docs/TRIAGE-110.md` and other docs about Bive's own history | Not rules. |

## What you keep (merge by hand, never overwrite)

- `opencode.jsonc`: your private-path denies, MCP servers and models stay. Add what is new in Bive's (agents,
  policies) line by line in the diff. Keep the existing app owner, private-path denies and registry identity and
  defaults; new protected plugin files such as `bive_coordinator_merge` require reviewed source before adoption.
- `AGENTS.md`: take Bive's core sections (Roles, Rules, Coding rules, Inviolable prompts, Field reports); keep your
  *Project rules* and *Before committing* exactly as they are.
- `.bive/prompts/project/`: your additions to the role prompts. Review and migrate any legacy `SUPERVISOR.md`
  additions explicitly to `ADVISOR.md`; never auto-load or blindly rename them into the advisor role.
- `.bive/models.json` and `.bive/gate.json`: your models, your skippable checks, your named owner and your merge
  opt-in (never Bive's; the opt-in defaults to disabled and is not copied between apps).
- `.github/workflows/bive-*.yml`: take Bive's logic, keep your own `runs-on` labels and your project's test command
  (`docs/SELF-HOSTED.md`).

## What you take from Bive

The core role prompts (`.bive/prompts/COORDINATOR.md`, `DELEGATE.md`, `ADVISOR.md`), `.bive/templates/`,
`.opencode/plugins/`, `.opencode/skills/` and `.bive/skills.json` (re-check each skill's revision), the Bive scripts of
`.github/scripts/`, and the pages of `docs/` that describe the rules (including `docs/COORDINATOR-MERGES.md`; the
protected merge tool is drafted and being tested on Bive first, default off, not live deployed or proven). The
protected merge plugin relies on recorded session identity; shared accounts and the absence of an OS-level sandbox
remain caveats rather than proof of a human.

## Turn 1: read only

Nothing is written. Find the Bive commit the project was last installed or updated from (the install or update pull
request's body names it, as below). Then list, for each file group above, what changed in Bive since, and show the
diff of every file that exists in the project and would change. Always report two things separately, because they
change behaviour:

- what changed in the **gate**: `.github/workflows/bive-*.yml`, `.github/scripts/`, `docs/REQUIRED-CHECKS.md`, and
  whether `.bive/gate.json` is now needed;
- what changed in the **guard**: `.opencode/plugins/worktree-guard/`, and the inviolable list of `AGENTS.md`.

Then stop and wait for the owner's answer.

## Turn 2: one coordinator pull request

Only after the owner says yes: one branch `update/bive-<date>` and one pull request labelled `coordinator`, so
`bive-inviolable` accepts the inviolable files. The body starts with the line `Bive: <commit sha of Bive's branch you
took it from>` (the next update starts there), then lists the gate and guard changes of turn 1 and the project's own
checks run. The owner merges it like any other.

## Paste into OpenCode at the project's root

```text
Update this project's Bive from https://github.com/bived-apps/bive, in two turns, following docs/UPDATE.md of that
repository. Turn 1, read only: write nothing. Never copy .bive/registry-id, .bive/state/, HANDOFF.md, ROADMAP.md or
Bive's tests. Show what changed in Bive since the commit this project last took, the diff of every file here that would
change, and, separately, what changed in the gate and in the guard. Keep opencode.jsonc, .bive/prompts/project/,
.bive/models.json, .bive/gate.json, the project rules of AGENTS.md and this project's runners and test command. Stop
and wait for my answer. Turn 2, only after I say yes: one branch update/bive-<date>, one pull request labelled
coordinator whose body starts with "Bive: <sha>"; never create a repository or a remote.
```
