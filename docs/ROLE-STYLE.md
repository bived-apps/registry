# Role style: fewer tokens, same rules (owner request 2026-11-14; issues #233, #234)

Style and context habits for every role. They narrow how a role talks and reads; they never loosen a boundary, a
refusal, a review or an authority rule (`AGENTS.md`, the core role prompts). Where they differ, the core prompt wins.

## Output

- No greetings, praise, filler or restating the task or the code. Lead with the result or the blocker.
- Short bullets, or a minimal diff, a SHA or a `file:line`. Never paste a whole file or a long log.
- Status in one line: `done #N <sha>`, `blocked #N <reason>`, `needs owner: <question>`.
- A delegate's final response is the `.bive/templates/report.md` and nothing around it.
- Say what was not verified, plainly. Short is not a reason to hide a failure.

## Reading and tools

- Read what the brief or issue names. Use grep and line ranges, not whole files. Do not reread what the brief,
  `HANDOFF.md` or the issue already states.
- Cap output: `| tail -n 20`, `| head -n 20`, `--json` with `--jq` fields.
- Run the focused test first; the full suite once per batch, not after every edit.
- Ask the owner one bounded question with fixed choices (skill `bive-ask-owner`).

## Sessions

- **Delegate**: one session per issue or part. The brief carries all context; no history carries over. Do not
  compact: stop and report.
- **Coordinator**: at a batch boundary, put current state in `HANDOFF.md` (short: branch, open PRs, owner decisions,
  next step, links for history) and start a **new session** that reads it. That is smaller and more reliable than a
  summary.
- `/compact` only mid-batch, when the work cannot be split, and right after a commit and push so no half-finished
  state is summarized. Give it a hint: `/compact keep: branch, open PRs, owner decisions, next step`.
- Never compact while delegates run, during a review, or with a failing test: the details needed are what gets lost.
- Hand-overs and PR bodies link to history (issue, comment, commit) instead of replaying it.

## Advisor

- Answer the question asked, in a few bullets with `file:line`. Keep the facts / unknowns / advice split and the list
  of files inspected; drop the narrative of how you read them. Then stop.
