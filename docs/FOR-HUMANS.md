# Bive for the human owner

<img src="design/role-owner.svg" width="32" alt="Owner glyph: a key in a gold ring">

![Scene showing a delegate offering finished work to a coordinator who cannot approve it, so both turn to the owner to decide.](design/cast/scene-refusal.svg)

What you do, and what you never have to do. The agents do the rest.

## Your three jobs

1. **Agree the plan and the team** (gate 1): read `ROADMAP.md` and the split the coordinator proposes; approve the
   work, the team and the three gates. Nobody else gets these supervisory decisions.
2. **Answer questions** the coordinator brings you, in one line each (below).
3. **Authorize merges and releases**: press the dated merge authorization on each pull request you accept (below), close
   pull requests, and release tests. Nobody else merges, closes or releases.

## Answering a question

The coordinator posts questions as a block (`.bive/templates/question.md`) numbered Q1, Q2... Answer one line per
question, in the session or as a comment on the issue:

- `Q2 yes` or `Q2 no`
- `Q2 other: <what you want>`
- `Q2 advisor`: get read-only advice (the advisor answers, then returns the decision to you; advice is not
  authorization)
- `Q2 coordinator`: let the coordinator decide (never accepted for merges, the label, gates, or rule changes)

A question with no answer after one day gets a public status comment on the issue and may move up or around as the
skill `bive-ask-owner` says. Everything you answer is also written on the issue, so there is a record.

## The dated merge label

Every pull request into `bived` (or a `milestone/<name>`) shows a red check, `bive-merge-gate / merge-gate`, until you
authorize it. That red means "waiting for the owner", not "broken". To authorize:

1. Read the pull request (the coordinator has approved it and tests are green).
2. Add the label `bive-merge-authorized-until-YYYY-MM-DD`, with **today's date in UTC** (on GitHub: the pull request's
   Labels box; or `gh pr edit <n> --add-label bive-merge-authorized-until-YYYY-MM-DD`; create the label first if it does
   not exist: `gh label create <that name>`).
3. The gate turns green by itself. The owner then merges, with a merge commit, never squash. By default the
   coordinator cannot merge; an explicitly scoped owner grant is required and is not enabled by default. The protected
   merge tool is drafted and being tested on Bive first (default off), not live deployed or proven. See
   `docs/COORDINATOR-MERGES.md`. An exceptional coordinator executes only an opted-in sub-coordinator merge through a
   base-enabled flag and a fresh exact-scope permission; it never closes pull requests, approves teams or gates, or
   releases tests. The plugin relies on recorded session identity, not on an account proving a human: shared accounts
   and the absence of an OS-level sandbox remain caveats.

Rules of the label: it is valid until 23:59:59 UTC of its date; the date must be the day you apply it (a future date
is refused); the coordinator never applies it. Remove it to withdraw the authorization. A pull request that changes the
rules, the prompts, the plugins or `opencode.jsonc` carries the label `coordinator`: those are the only ones allowed to
change them, and still need yours. Details: `docs/REQUIRED-CHECKS.md`.

## The public registry (optional)

At install you are asked once whether the project reports **anonymously** to the public registry
(<https://bived-apps.github.io/registry/>). It is off unless you say yes.

- **Yes**: the agents write a random id into `.bive/registry-id` and commit it. From then on every session reports a
  random id, token counts per model, violation counts and the code size rounded to two digits. No name, path, text or
  date.
- **No** (or no answer): nothing is created and nothing is sent.
- **Change your mind**: delete `.bive/registry-id` in a pull request; on one machine `export BIVE_REGISTRY=off` stops it
  at once.
- A project is listed on the page only after three sessions on two different days, as `#1`, `#2`... without its id.

More: `docs/REGISTRY.md`.

## Where to look

| You want | Read |
| --- | --- |
| What the agents are doing now | `HANDOFF.md` |
| What is planned | `ROADMAP.md` |
| Why a check is red | `docs/REQUIRED-CHECKS.md` |
| How the coordinator works | `docs/COORDINATING.md` |
