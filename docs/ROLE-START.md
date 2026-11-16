# Role at session start, and quick choices (design for issues #232 and #244; proposal, not in force)

Owner direction, 2026-11-14 (answered with buttons): follow an `AGENTS.md` rule (no optional start agent). The rule text
is not written yet: it is an inviolable-file change for a separate, owner-authorized coordinator PR.

Status: a design for the owner's review. It changes no rule, prompt, config or skill. Adopting it needs the owner's
decision (marked **Owner**) and, for the pieces that touch inviolable files, a separately authorized coordinator change.

## 1. Which role does this session take (#232)

Bive has three working roles and an owner: advisor, coordinator, delegate. A session that starts with none assigned must
not guess and must not act as a role by default.

### Precedence: the role is already given

Read in this order; the first present signal wins, a later one that disagrees is a **conflict** and the session stops:

1. the named agent of the start (`--agent delegate`, `coordinator`, `advisor`);
2. `BIVE_ROLE`;
3. the role file `.bive/state/role` (#36);
4. the worktree path `.worktrees/issue-<n>` (a delegate);
5. an explicit launch hand-over or brief that names the role.

Given any of these: **do not ask**. A conflict (`BIVE_ROLE=delegate` in a coordinator checkout, two different
signals) fails closed: say which signals disagree and stop. A resumed session keeps its role and never re-asks.

### Nothing given: ask once, with buttons

In OpenCode, use the `question` tool with fixed choices: **advisor**, **coordinator**, **delegate**, **none of these
(just answer a question)**. Elsewhere, ask in plain text and stop for the answer (never claim buttons were shown).

- **none of these**: answer only; no work authority, no identity change, no writes.
- A chosen work role then reads its prompt and `project/<ROLE>.md`, checks **eligibility**, and only then starts.
- Choosing a role is not authorization: a coordinator still needs the owner's approval for its milestone (`AGENTS.md` ›
  Roles); a delegate still needs a brief.

### Eligibility (fail closed)

- The model running now must be in the project's list for that role (`.bive/models.json`) and, for a coordinator,
  meet the published bench minimum (`docs/PROVIDERS.md`). An unlisted or unrecorded model: report it and stop.
- Only a work role sets its worktree identity: `git config --worktree user.name "<role> <provider/model>"`.
  Answer-only sessions set none.

### Non-interactive runs never ask

`opencode run` and coordinator-started delegates have nobody to answer. They resolve the role from signals 1 to 5; if
none is present or they conflict, they exit with a clear blocker line (`blocked: no role assigned`), never a question.

### Cases a test must cover

Fresh interactive session asks once and waits; each of the five signals suppresses the question; conflict and
unrecorded model fail closed; cancel and "none of these" stay answer-only; resume does not re-ask; a delegate started by
a coordinator never asks; identity is set only for work roles. Proposed home: `tests/agents-config.test.ts` with a pure
`resolveRole(signals)` function. **Owner**: an optional `start` agent that asks, versus a rule in `AGENTS.md`; and whether
the core prompts may carry a line for this (they are inviolable).

## 2. Quick choices across Bive apps (#244)

Short clickable answers instead of typed yes/no, for any bounded decision.

- **Mechanism**: the client's native question tool (OpenCode `question`): short labels, one-line consequences, the
  recommended choice first and marked, custom answer and cancel allowed. One decision per question; no combined yes/no.
- **App screens**: a question about what a native app shows uses that app's own choice dialog when it exposes one (for
  example an MCP `ask_user`), under that app's consent scopes; never ask the owner to retype private app data in chat.
- **Skill, not global config**: ship the guidance in the existing `bive-ask-owner` skill (already provisioned to all three
  roles, hashed in `.bive/skills.json`) as a new section, rather than a new skill or an unreviewed global install. Changing
  it changes its revision hash; apps pick it up through the update procedure (`docs/UPDATE.md`).
- **Authority stays explicit**: pressing a button grants only what the question named. Never "yes, and everything".
- **No stalling**: a non-interactive delegate or preassigned role never opens a form; missing authorization becomes a
  blocker in its report. A resumed session does not re-ask a settled question (the answer is in the issue or `HANDOFF`).
- **Fallback**: with no interactive tool, ask in plain text, list the choices as a numbered list and stop; say that no
  buttons were shown.

### Acceptance (owner-observed, not run here)

Quick choices appear in two Bive-managed projects; cancel and a custom answer both work; a resumed session does not
repeat a settled question; role start (section 1) uses the same mechanism. Full session-tree visibility is #243.

## What this design does not do

It does not edit `AGENTS.md`, `opencode.jsonc`, a core prompt or a skill. It cannot prove how OpenCode orders signals 1
to 4 in practice: that is the smoke test above.
