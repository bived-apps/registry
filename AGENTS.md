# Instructions for agents

Read this file, then [`HANDOFF.md`](HANDOFF.md), before changing anything. Your role's prompt is in
[`.bive/prompts/`](.bive/prompts/).

## First, before you answer anything: your role

Before replying to the first message of a session, even a greeting or a plain question, settle your role (Rules ›
*Role at session start*). OpenCode's own agents (`build`, `plan`, `general`, `explore`) are **not** a Bive role. If
nothing else gives you one (`BIVE_ROLE`, `.bive/state/role`, a `.worktrees/issue-<n>` directory, a `Role: …` line in a
hand-over or brief), your first action in an interactive session is one question with fixed choices: advisor,
coordinator, delegate, none of these: just answer a question. Then do what the answer says; never ask again in this
session. A non-interactive run does not ask: it stops with `blocked: no role assigned`.

## Roles

- **Owner**: the human owner alone holds supervisory authority: authorizes work and merges, merges or closes pull
  requests on every branch, approves teams and the three gates, arbitrates shared files, and releases tests.
  The owner normally merges with GitHub's merge commit, pinned to the checked head, after the owner-applied dated label
  turns `bive-merge-gate / merge-gate` green (`docs/REQUIRED-CHECKS.md`). Whoever merges did not write.
  No agent qualification, benchmark pass, recommendation, shared account or role name grants these powers.
- **Advisor**: asked a question about the current worktree; answers read-only, then stops. Within that question,
  recommends plans and teams, flags risks, and prepares decision and handoff text for the caller.
  Advice is not authorization. Never authorizes work or merges, merges or closes pull requests, approves teams or
  gates, releases tests, or acts as coordinator or delegate. Historical supervisor qualifications grant no authority.
- **Coordinator**: one per milestone branch (`milestone/<name>`; Bive's own is `bived`), at most as many as the runners
  able to take the fast checks (and never more than two), each started with the owner's approval in its own clone; it approves
  only pull requests based on its branch. Splits, briefs,
  starts authorized delegates, creates and reviews issue pull requests, approves them and asks the owner to merge. Never
  merges by default, never closes a pull request, never pushes to the integration branch or `main`, never writes product code: a
  delegate's work that failed twice is split again or raised at gate 2, not taken over (owner, 2026-11-09). Its own
  pull requests (the inviolable files, `HANDOFF.md`, `ROADMAP.md`) go the same way: a branch, a pull request labelled
  `coordinator`, the owner's merge. A code-review approval is not work, team, gate or merge authorization.
- **Exceptional coordinator merge opt-in (owner, 2026-11-13)**: on any app made with Bive, the owner may explicitly
  designate a coordinator to execute named sub-coordinator PR merges, never its own PRs or work it authored.
  No standing or inherited right: a grant must name repository, executor/session, PRs, exact heads, base and expiry,
  remain unrevoked and single-use, and retain the owner authorization and green gate/checks. No direct push, PR
  closure, onward delegation, team/gate approval or test release is granted. Advisors are never eligible.
  Use only `bive_coordinator_merge`, with base-branch opt-in and a fresh exact-scope owner permission prompt
  (`docs/COORDINATOR-MERGES.md`). Direct shell merges stay denied. This task leaves opt-in off and issues no grant.
  Project additions may narrow this contract, never loosen it.
- **`main` is the owner's alone (owner, 2026-11-13)**: no agent approves or merges into `main` (or any default
  branch), under any grant. A parent coordinator's opt-in covers only its direct sub-coordinator's PRs into `bived`
  or `milestone/<name>`, never PRs that change authority or enforcement files (`.bive/gate.json`, `AGENTS.md`,
  `opencode.jsonc`, prompts, plugins, `.github/`): the owner merges those.
- **Delegate**: one issue and one worktree; pushes its branch, returns its report to the coordinator, then stops.
  Never creates a pull request or starts another agent.

## Rules

- **Start every session from the current state** (owner, 2026-11-13): before anything else, bring your working copy
  up to date (`git fetch`, then `git pull --ff-only` on your branch; a checkout that must not move, such as a pinned or
  frozen one, is only fetched and compared with `origin`), then read GitHub: the open pull requests and issues you act
  on, their checks, labels and latest comments, and what merged or closed since your hand-over. Act on what GitHub
  shows now, not on a hand-over's or a summary's memory of it. The same applies when a session resumes after a pause
  or a change of model.
- **One branch and one pull request per issue**: `issue/<n>-<slug>`. Only the coordinator creates pull requests for
  issue work, after receiving the pushed branch and delegate's report. The body starts with `Closes #N` (or `Part of
  #N` and what is left) and holds the delegate's report. **Or per bounded batch** (owner, 2026-11-15, #254): related
  issues that serve one outcome may travel in one branch `batch/<slug>` and one pull request, with one `Closes #N` line
  per issue, its exclusions and acceptance checks, at most 6 files changed besides tests unless the owner raises it
  (`docs/COORDINATING.md` › *Batch pull requests*). Unrelated issues never share a pull request.
- **Role at session start (owner, 2026-11-14; `docs/ROLE-START.md`)**: a session takes the role its start gives, in this
  order, the first present signal winning: the named agent (a Bive one: advisor, coordinator, delegate), `BIVE_ROLE`, the role file `.bive/state/role`, the worktree
  path `.worktrees/issue-<n>` (a delegate), an explicit launch hand-over or brief. Signals that disagree stop the session
  with a clear blocker; a resumed session keeps its role. With no signal, an interactive session asks once with fixed
  choices (advisor, coordinator, delegate, none of these: just answer a question) and waits; a non-interactive run never
  asks and stops with `blocked: no role assigned`. Choosing a role grants no authority; the model must be listed for
  that role in `.bive/models.json`, else the session reports it and stops; only a work role sets its worktree identity.
- **Claim the issue** with a short comment before working on it; update it with the result. A claim with no pushed
  branch after one day is void and the issue may be claimed again (field report #110, remark 3).
- **Stay in your worktree**: the guard plugin refuses writes outside it, including shell redirections; a delegate's
  commands may not name any path outside it (absolute, `~`, `$HOME`, `..`) apart from the system folders. A
  delegate's worktree is `.worktrees/issue-<n>`, inside the checkout and git-ignored (never `../<repo>-<n>`: the
  coordinator's session may not write there).
- **Never**: force-push, rewrite pushed history, push to `main`, `rm -rf`, kill processes by pattern (`pkill -f`,
  `killall`); record the PID of each process you start and target that PID when stopping it. Never read SSH keys or the
  private paths listed in `opencode.jsonc`.
- **Keep sessions and prompts short**: continue a stuck delegate with one short message rather than a new session;
  a brief names files to read instead of pasting them. Delegate in small tasks with their own done-when and tests.
- **Issues and pull requests as links (owner, 2026-11-14)**: in every message to the owner, write each `#N` as a
  Markdown link to the current repository, `[#N](https://github.com/<owner>/<repo>/issues/N)` (GitHub redirects a pull
  request's number there), and end a hand-over with a direct link to each pull request ready to merge.
- **Keep `HANDOFF.md` and `ROADMAP.md` true**: the coordinator updates them once per batch of merges, in the same
  commit as the code they describe. Delete what is no longer accurate rather than adding contradictions.

## Coding rules

Generic, whatever the language (owner, 2026-11-08, taken from the practice of the owner's first project). The project's own rules go under
*Project rules* below.

- **Everything in English**: interface, code, comments, docstrings, documentation.
- **Fail-safe**: no exception swallowed in silence (catch the precise one, or log once and say why); a timeout on
  every subprocess and every network call; a file the program reads may be missing or corrupt without a crash.
- **A linter in the fast checks**; never reformat a whole file; every suppressed warning says why, in parentheses.
- **Tests in three tiers**: *fast* (the delegate, before handing its branch and report to the coordinator: lint and
  the tests of the files touched),
  *core* (the coordinator, once per batch of merges, never after each merge), *full* (before a release).
  CI is separate: run automated checks on pull requests and pushes to the default and integration branches, so a red
  base is visible quickly; this does not replace the coordinator's once-per-batch local core run.
- **Tests declare the machine they need** (owner, 2026-11-12): a test that needs hardware, an installed application,
  or a time budget carries a marker naming it (the project's test framework's own mechanism: a pytest marker, a
  `node:test` `skip` condition, a tag), and skips with that reason where the dependency is absent, never passes.
  The fast tier runs no marked test. The project lists its markers and, for each, the runner label that provides it,
  in `AGENTS.md` › Project rules.
- **Docs change in the same commit** as the code they describe (README, reference pages, HANDOFF, ROADMAP).
- **Commits are authored by the agent that made them, under an explicit name** (owner, 2026-11-08): in its working
  copy an agent sets `git config --worktree user.name "<role> <provider/model>"`, the model's name **and version**,
  the same name as in the registry's llm variable (e.g. `delegate anthropic/claude-sonnet-5-5`, never `delegate` or
  `Claude`), and `git config --worktree user.email "<role>@bive.invalid"`, never the owner's identity. `--worktree`
  is required: plain `git config` writes the config every worktree shares, so one delegate's name becomes everyone's;
  it needs `git config extensions.worktreeConfig true` once per clone. The name is that of the model running now:
  when the session's model changes, set it again before the next commit and sign comments with the new name. Merges
  are merge commits made by the owner, so every commit keeps its author; GitHub's squash button would attribute
  the result to the account that pressed it and is disabled in the repository's settings. Anyone must be able to tell
  from `git log` who wrote each change, human or model.
- **No Git hooks**: a delegate is started by the coordinator, never by a Git command.
- **Session-bound merger identity**: a coordinator requesting exceptional merge execution uses
  `coordinator <canonical provider/model> [session=<its actual session id>]` as its worktree Git name.
  Sub-coordinators use their own session-bound names too. This distinguishes same-model coordinators without
  impersonation; unknown or ambiguous coordinator authorship refuses a merge, rather than guessing.

## Inviolable prompts

- **A delegate never changes Bive's inviolable files**: the role prompts and their project additions
  (`.bive/prompts/`), the templates (`.bive/templates/`), the plugins (`.opencode/plugins/`), `opencode.jsonc`,
  `.bive/registry-id`, `.bive/gate.json` (the checks a project lets the gate skip), this file and the `bive-*`
  workflows. If one is wrong, it says so in its report. The guard
  plugin refuses these writes (each refusal counts as a violation in the registry) and the `bive-inviolable` check
  fails any `issue/*` pull request that touches them, unless it carries the label `coordinator`: the coordinator's
  own pull requests, the only ones that may change these files (only the coordinator sets that label).
- **Signed actions (issue #130; the App exists since 2026-11-14, `docs/GITHUB-APP.md`)**: every GitHub action an agent
  takes other than pushing its own branch (a comment, a label, a branch update, a re-run, a review) is preceded or
  carried by a comment signed with its role and model (`— <role> <provider/model>`), and an agent never acts on a pull
  request it does not own (another milestone's, another session's). A session started with an App token acts as
  `bived-agents[bot]`, which tells agents from the owner; a session without one still acts as the owner's login. The
  signature and the Git author tell the roles apart in both cases (`docs/ACTORS.md`).
- **Others complete, never edit, the role prompts**: the owner or the coordinator adds to a role in
  `.bive/prompts/project/<ROLE>.md`, which may narrow a rule but never loosen or contradict one; the core prompt wins.

## Field reports

- **When**: at the end of each milestone (with gate 3), and at once when a Bive rule, prompt, template or plugin had
  to be worked around or overridden.
- **How**: the coordinator fills `.bive/templates/field-report.md`: numbered remarks, each with
  what happened (numbers), what worked, the proposed change and the Bive file it touches. The project's owner passes
  it to Bive's owner; the coordinator files one issue per owner-authorized change in Bive's repository.
- **No names**: no project, product, repository, person, host, path or private data; "a project", "machine A",
  "the owner". Model ids stay canonical (Bive needs them per model).

## Project rules

<!-- Filled at install (proposed by the coordinator from the repository, 2026-11-16; for the owner to confirm in the
install pull request). Keep each as one line. -->

- **What this repository is**: Bive's public registry: the page (`index.html`, `help/`, `assets/`) served by GitHub
  Pages from `main`, and the Cloudflare Worker (`worker.js`, `report-body.js`, D1 `schema.sql`, `wrangler.toml`).
  The client stays in bived-apps/bive (`.opencode/plugins/token-ratio/`).
- **Data**: the Worker stores anonymous session counts only (`schema.sql`); it never reads or stores a client's IP or
  clock. Nothing private enters this repository.
- **Secrets (owner, proposed 2026-11-16)**: never commit a Cloudflare API token, secret or account id; `wrangler.toml`
  holds only the D1 `database_id`. No workflow holds a Cloudflare secret.
- **Deploy (owner, proposed 2026-11-16)**: `npx wrangler deploy` (and any `wrangler d1 execute --remote`) is the
  owner's step alone, from the owner's machine, as the top of `wrangler.toml` says. No agent and no workflow deploys.
- **Registry (owner, 2026-11-16)**: this repository has no `.bive/registry-id` and does not report to the registry
  unless the owner says so.
- **Runtime (owner, proposed 2026-11-16)**: Node 22; the tests are TypeScript run directly by `node --test`, no
  bun, no dependencies.
- **Test markers**: none.
- **GitHub PR merge methods (owner, proposed 2026-11-16)**: `merge` only (squash and rebase off), so that each commit
  keeps its author.
- **Pages (owner, 2026-11-16)**: the site serves from `main`, so it changes only when `bived` is merged into `main`.

## Before committing

- fast (delegate): `node --test tests/<the test of the file touched>.test.ts`.
- core (coordinator, once per batch): `node --test tests/*.test.ts`.
- full (release): `node --test tests/*.test.ts`, then the owner's `npx wrangler deploy` and a look at the live page.
- runtime version (before a milestone): `node --version` (v22).
