# Required checks

Bive's expected checks before merging a pull request. This page is a repository-readable inventory: it names the
automated GitHub Actions checks, their conditions, and the checks that are run locally by a coordinator. It describes
Bive's intended merge policy and maps to the workflow files; it does **not** prove which checks GitHub branch
protection currently requires (that configuration lives in the repository's settings). The workflow files named below
are the source to compare against and to update when check names or behavior change.

## Automated checks (GitHub Actions)

These run on GitHub and appear as commit statuses on a pull request.

### `bive-tests / tests`

- **Workflow file**: `.github/workflows/bive-tests.yml`
- **Job**: `tests`
- **Triggers**: `push` to `main` and `bived`; `pull_request` (default activity types: `opened`, `synchronize`, `reopened`).
- **Runs**: `ubuntu-latest`, Node 22, `node --test tests/*.test.ts`, timeout 10 minutes.
- **What it checks**: the repository's test suite (`tests/*.test.ts`).
- **Expected on PRs**: yes — the `pull_request` trigger runs it on pull requests (default activity types).

### `bive-inviolable / check`

- **Workflow file**: `.github/workflows/bive-inviolable.yml`
- **Job**: `check`
- **Triggers**: `pull_request` of types `opened`, `synchronize`, `reopened`, `labeled`, `unlabeled`.
- **Condition (job `if`)**: runs only when `github.head_ref` starts with `issue/` **and** the pull request does not
  carry the `coordinator` label:
  `startsWith(github.head_ref, 'issue/') && !contains(github.event.pull_request.labels.*.name, 'coordinator')`.
- **What it checks**: compares the changed files against the base branch and fails if any inviolable path changed,
  unless that file is byte-identical to the default branch's (issue #198: a sync of the default branch into a milestone
  carries the default branch's own inviolable files; any other difference from the default branch still fails).
  The matched paths are: `.bive/registry-id`, `.bive/gate.json`, anything under `.bive/prompts/` or `.bive/templates/`, anything under
  `.opencode/plugins/` or `.opencode/plugin/`, files matching `.github/workflows/bive-*`, `opencode.jsonc`, and
  `AGENTS.md`.
- **Skip conditions** (the job is skipped, not failed):
  - the head branch does not start with `issue/` (for example a coordinator's own pull request on another branch);
  - the pull request carries the `coordinator` label (a coordinator's own pull request that legitimately changes an
    inviolable file).
- **Why**: a delegate's pull request must never change Bive's inviolable files (see `AGENTS.md` › Inviolable prompts).
  Only the coordinator changes them, and only on pull requests it labels `coordinator`.

### `bive-merge-gate / merge-gate`

- **Workflow file**: `.github/workflows/bive-merge-gate.yml`; script `.github/scripts/check-merge-gate.mjs`, decision
  in `.github/scripts/merge-gate-lib.mjs`.
- **Job**: `merge-gate`
- **Triggers**: `pull_request_target` on pull requests targeting `bived` or `milestone/**`, types `opened`,
  `synchronize`, `reopened`, `labeled`, `unlabeled`. It checks out the base commit only and never runs code from the
  pull request's head; its permissions are read-only (`contents`, `pull-requests`, `checks`, `actions`: `gh pr checks`
  reads each check's workflow run, which a private repository refuses without `actions: read`, #101).
  In a **public** repository, GitHub's default event policy blocks `pull_request_target` from 2026-12-02 unless an
  Actions event policy allows it (#404). See *Branch protection* below.
- **Runs**: `ubuntu-latest`, Node 22, timeout 5 minutes. It reads the pull request and the checks once, then decides.
  It never waits on a runner. If a check is pending or a required one is missing, the gate fails immediately with
  "required CI checks have not finished yet; the gate runs again when they complete"; the re-run is triggered by
  `.github/workflows/bive-merge-gate-rerun.yml` (`workflow_run` on `bive-tests` and `bive-inviolable`, default-branch
  behavior) and turns the gate green by itself once the checks pass.
- **Authorization**: exactly one label `bive-merge-authorized-until-YYYY-MM-DD` on the pull request, a real calendar
  date, valid through 23:59:59 UTC of that date and only while the base is `bived` or `milestone/<name>` (one path
  segment). Only the owner applies it, after the coordinator's approval and when the owner is about to merge;
  the coordinator never does, also on its own pull requests. Adding or removing it re-runs the gate.
- **Parent approval instead of the label (#262)**: on `bived` or `milestone/<name>` only, never `main`, a signed
  approval comment of this exact head, verified against the owner's grant in `.bive/gate.json` on the base
  (`coordinatorMerges: true` and a matching `coordinatorMergeGrants` entry), stands in for the dated label. It does not
  cover a PR labelled with an override, a PR that changes authority or enforcement files (`.bive/gate.json`,
  `AGENTS.md`, `opencode.jsonc`, prompts, plugins, `.github/`), or a red check. The owner's dated label still works.
- **Label date (issue #114)**: the label's date must equal the UTC day on which the `labeled` event applied it (read
  from the issue timeline). A label dated tomorrow or later (or any day other than the applying day) is refused.
- **Label actor (issue #114)**: the `labeled` event's actor must be the repository owner (or a listed owner identity).
  What this proves and what it does not: while every role shares one GitHub account (#86), the actor is always the
  owner's account, so this check cannot distinguish the owner from an agent acting under that account. It becomes
  meaningful only once roles hold distinct identities (#110 remark 4); until then the owner's out-of-band decision
  (applying the label at all) is the real authorization. The open question in #114 stands: accept this limitation or
  require a second proof only the owner can give (e.g. a signed or out-of-band token).
- **Agent identity (issue #130)**: once a GitHub App is installed for the agents, its actions show as
  `actor.login: "<slug>[bot]"`, `actor.type: "Bot"`, and `performed_via_github_app` set. The gate refuses a dated
  label (and an override label) whose labeled event has `actor.type: "Bot"` or `performed_via_github_app` set, so an
  agent can never authorize its own merge. The App's permissions are contents write, pull requests write, issues
  write, checks read, actions read; no administration, no workflows write. The App cannot merge into `main`: rulesets
  restrict updates with the owner (repository admin role) as the only bypass. Until the App exists, the immediate
  rule in `AGENTS.md` applies: every GitHub action an agent takes other than pushing its own branch is preceded or
  carried by a comment signed with its role and model, and an agent never acts on a pull request it does not own.
- **Owner override (issue #115)**: an optional label `bive-owner-override-YYYY-MM-DD` (same date rules and actor
  check as the authorization label). With it, the gate passes even when required checks are pending or missing, but
  never when a check is red (failed, cancelled, or otherwise non-pass). The override is the only way to merge past a
  gate that is not green; it is the owner's, and it never covers a red check. The gate records which checks were
  missing/overridden. At most one override label.
- **Red before the label is expected**: on every pull request without the label the gate fails with "exactly one
  dated merge-authorization label is required". It means "waiting for the owner", not a failure to fix.
- **What it checks**: the authorization above; exactly one `bive-tests / tests` and one `bive-inviolable / check`,
  both `pass`; every other check except its own `pass` as well. The one accepted exception: `bive-inviolable / check`
  may be `skipping` on a pull request labelled `coordinator` (its job condition skips it there). It re-reads the pull
  request after reading the checks and fails if the head, base or labels changed.
- **Skippable checks (issue #200, owner 2026-11-12)**: a project whose CI skips a job by design (for example its
  tests on a Markdown-only change) lists it in `.bive/gate.json`: `{"skippable": ["bive-tests / tests"]}`, each entry
  `<workflow> / <job>` as the checks list shows it. A listed check that is `skipping` counts as passing, required or
  not; `fail`, `cancel` and `pending` never do. The gate reads the file from the pull request's **base** branch, so a
  pull request cannot list its own skips; the file is inviolable (a delegate never changes it). A missing, corrupt or
  wrong-shaped file means nothing may be skipped, which is Bive's own setting (`{"skippable": []}`).
- **Named owner (issue #249, owner 2026-11-13)**: the dated labels count only when the repository owner applied them.
  On a repository that belongs to an organization, the owner's login goes in the same file:
  `{"skippable": [], "owner": "<login>"}`. The gate reads it from the base branch, so a pull request cannot name its
  own owner; without it the gate compares with the repository owner's login, which on an organization no person's
  label matches. A label applied by a Bot or a GitHub App is refused either way (#130).
- **Fails on**: a missing, malformed, duplicate or expired label; any required check pending or missing (an
  immediate red that means "wait for CI", not a refusal — the gate is re-run automatically when checks complete),
  or any check skipped (other than the exception), failed or cancelled; a pull request whose head or base changed
  during the run.
- **Several coordinators**: each approves only pull requests based on its own milestone branch; the gate does not
  check which coordinator approved, the owner does (`AGENTS.md` › Roles).
- **Expiry is not re-evaluated on its own**: a gate that passed stays green after its date. The owner applies the
  label dated the day of the merge, and the owner merges that day with `gh pr merge --merge
  --match-head-commit <sha>`, so a push after the gate's run refuses the merge.

### `bive-merge-authority / merge-authority`

- **Workflow file**: `.github/workflows/bive-merge-authority.yml`; script `.github/scripts/check-merge-authority.mjs`.
- **Job**: `merge-authority`
- **Triggers**: `push` to `bived` and `milestone/*`.
- **What it checks**: the pushed commit must be a merge commit; its committer identity must not match the author of
  any commit it brings in (the commits reachable from the second parent but not the first). A direct (non-merge)
  push, or a merge whose committer also authored one of its brought-in commits, turns this check red on the base.
- **Why**: the gate runs before the merge and cannot know who will press it; this push-time check enforces
  "whoever merges did not write" (`AGENTS.md` › Roles) after the fact. It is the complement of the dated-label check.
- **Single-account caveat**: while every role shares one GitHub account, the committer identity check is only as
  strong as the distinct author identities in the commits; see #114's open question.

## Failure categories (issue #127)

A failing check belongs to one of three categories, each with one action:

- **Base (red base)**: the failure reproduces on the base branch without the pull request. Action: merge only
  baseline-fix pull requests one at a time, with failure logs proving each has no remaining failure except another
  identified baseline issue; recheck after each and block all other merges until green.
- **Pull request**: the failure reproduces on the pull request's head and is caused by its change. Action: the pull
  request's fault — brief the delegate again or split.
- **Non-deterministic**: the failure does not reproduce on one re-run with the same inputs (same seed, positions,
  inputs). Action: open (or comment on) an issue `Flaky: <test>` with the run links and the seed/positions/inputs
  needed to reproduce it, and stop retrying; at most one re-run per failure. The owner never merges past it
  without that issue and a green run on the head. Skipping or quarantining a test is forbidden; retrying in a loop
  is forbidden.

## Self-hosted runners: environment isolation (issue #121)

On a self-hosted runner (a single machine that keeps its state), a virtual environment kept between runs, or a
package-manager cache shared with the machine owner's own account, can give red tests that have nothing to do with
the code under test. The rule:

- Every environment, cache and tool a CI job installs lives under the job's workspace (`$GITHUB_WORKSPACE` or
  `$RUNNER_TEMP`), never in the runner account's home or a path the machine's users share.
- Cache and environment variables point there explicitly: for example `UV_CACHE_DIR`, `PIP_CACHE_DIR`,
  `npm_config_cache`.
- The environment is keyed on what built it (lock file hash and interpreter version), so a stale one is never reused
  silently; the health check of #116 compares the same key.
- The runner runs under its own system account, not the machine owner's.
- Rebuild from nothing on demand: a `workflow_dispatch` input or a label deletes the job's environment before
  installing.
## Marked tests (issue #122)

A test that needs hardware, an installed application, or a time budget carries a marker naming it (the project's
test framework's own mechanism: a pytest marker, a `node:test` `skip` condition, a tag), and skips with that reason
where the dependency is absent, never passes. The fast tier runs no marked test.

- **Routing**: a job for marked tests runs only on a runner with the matching label, alone on it (no other job at
  the same time, so a timing threshold is not skewed).
- **Reporting**: the report template's Checks section names which markers ran and which were skipped, so a skipped
  marker shows instead of a silent green.
- **Project rules**: `AGENTS.md` › Project rules lists the project's markers and, for each, the runner label that
  provides it.
## Self-hosted runner, workflow changes (issue #123)

On a self-hosted runner, a `pull_request` run executes the workflow files of the pull request's head. A branch that
edits a workflow therefore runs that edit on the owner's machine at once. The rule:

- Any change under `.github/workflows/` (or any script a workflow runs from the head) needs the owner's explicit
  agreement before its first run.
- A pull request that edits a workflow runs only on hosted runners until the owner agrees.
- Jobs on self-hosted runners run from `pull_request_target` with the base's workflow (the safe pattern, already in
  Bive's `bive-merge-gate`), or are gated by a GitHub environment with the owner as required reviewer.
- GitHub's "require approval to run workflows" setting applies to pull requests from forks, not to branches of the
  same repository, where every agent pushes; list the project's workflows on self-hosted runners in the project rules
  (`AGENTS.md` › Project rules).
- The coordinator's review names any diff under `.github/workflows/` and raises it to the owner; the owner's
  review design includes it.

## Branch protection (owner, in GitHub's settings)

The workflows report checks; they do not make GitHub enforce them. For the gate to block GitHub's merge button and
direct pushes, the owner configures branch protection (or a ruleset) on `bived` and `milestone/*` to
require the status checks `bive-merge-gate / merge-gate` and `bive-tests / tests`; the gate itself judges
`bive-inviolable / check`, including its skip on coordinator pull requests. A ruleset names a required check by its
job (check-run) name alone, `merge-gate` and `tests` with GitHub Actions as source: every workflow's job keeps a
name of its own, or the requirement matches several checks (#94). Until that configuration exists, the
gate is only as strong as the owner's procedure. No file in this repository proves that it exists; check the
settings.

**Public repository: allow `pull_request_target` for the gate (#404).** GitHub adds a default event policy that blocks
`pull_request_target` in public repositories with no applicable Actions event policy. GitHub enforces it from
2026-12-02 ([GitHub's page](https://gh.io/securely-using-pull_request_target#default-policy-for-pull_request_target)).
Without an allow policy the gate never runs, its required check never turns green, and nothing merges. Private and
internal repositories are not affected. At install, and once for an existing public app, the owner opens Settings →
Actions → Policies → New policy and sets the options below. In an organisation, the owner can set it once in the
organisation's settings instead (Target repositories: **All repositories**). That also covers every future repository
made from the template.

- Enforcement **Active**.
- Target **Include by pattern** `.github/workflows/bive-merge-gate.yml` only, so every other workflow keeps GitHub's
  block.
- **Restrict events** with `pull_request_target` among the allowed events.

Then check Policy insights. The gate's use is the safe one GitHub describes: it checks out the base commit, never the
pull request's code, with read-only permissions and no secrets. Do not move it to `pull_request`: a pull request
would then run its own edited gate. Since 2026-11-16, Bive's organisation has this policy for all repositories
(14528). The repository's own policy (14515) is now redundant: it is kept as a fallback in case the repository leaves
the organisation.

## Owner rollout and denial matrix (issue #239)

One GitHub App for all agents (`bived-agents`), installed on `bived-apps/bive` only (owner decision, 2026-11-14). There
is no per-role App and no supervisor App: the owner alone merges, and the gate proves the owner applied the dated
label. This section separates what GitHub enforces natively from what Bive's gate enforces, and records the denials
the owner tested.

### Native protection (rulesets) versus the gate

GitHub rulesets, in the repository's settings (the owner's configuration):

- **Integration ruleset** on `bived` and `milestone/*`: deletion refused, non-fast-forward refused, a pull request is
  required, merge method `merge` only, required checks `tests` and `merge-gate`.
- **`main` ruleset**: the same, plus Restrict updates with the Repository admin role as the only bypass, pull requests
  only.
- **No bypass for any App**: no rule names an App, so `bived-agents` is refused like any other actor.

The gate `bive-merge-gate` enforces the dated label `bive-merge-authorized-until-YYYY-MM-DD` applied by the owner's
own account: a label applied by a Bot or an App is refused. The rulesets block what GitHub can block; the gate blocks
the authorization only the owner can give.

### Denial matrix

| Action | Actor | Expected | Verified |
| --- | --- | --- | --- |
| An agent applies the dated label | App | refused by the gate | verified 2026-11-14 on scratch PR #300 |
| An agent comments | App | shows as `bived-agents[bot]` | verified 2026-11-14 |
| An agent merges into `bived` with a green gate | App | needs the owner's dated label first | by design |
| A non-owner updates `main` | App | refused by Restrict updates | verified 2026-11-15 |
| A force push or a branch deletion on `bived` or `main` | App | refused by the rulesets | verified 2026-11-15 (below) |
| The owner merges after labelling | owner | passes | verified on every merged PR |

`App` is an installation token of `bived-agents` (`docs/GITHUB-APP.md`); the owner applies the dated label.
Force push and deletion were tried on `milestone/denial-test` (the integration ruleset of `bived`): GitHub refused
both (GH013). On `main` the API lists the same two rules; they were not pushed against.

### Recovery without force

- A wrong merge is reverted by a new pull request running `git revert -m 1 <merge>`: never by force push, never by
  rewriting history.
- To stop the agents: uninstall the App (`docs/GITHUB-APP.md`) for the sessions that hold an App token, and stop
  the OpenCode service and its sessions (`opencode service stop`) for those running on the owner's own account;
  the rulesets and the gate stay in place.

## Labels the flow uses (minimum)

Four labels, no more. There is no started, in-progress, done, blocked or callback label: state is the milestone, the
pull request's checks and review, and the issue's open/closed state (`docs/COORDINATING.md` › Milestones are the work
queue). "Use this template" does not copy labels; a project creates these.

| Label | Set by | Read by | Why |
| --- | --- | --- | --- |
| `bive-merge-authorized-until-YYYY-MM-DD` | the owner only, on one pull request, on the day in its name | `bive-merge-gate` (also checks who applied it and when) | the dated, per-pull-request authorization |
| `bive-owner-override-YYYY-MM-DD` | the owner only, optional | `bive-merge-gate` | the owner's override when CI is down (#115) |
| `coordinator` | the coordinator, on its own pull requests | `bive-inviolable` (skips the check for them) | only the coordinator may change inviolable files |
| `bug` | `bive-base-red` | people | the issue opened when a base branch goes red |

A name is not a secret: the gate trusts the actor and the date of the labeling event, never the name alone, so a
random or secret label would add nothing while roles share one account (#130). Anything else a repository carries
(GitHub's defaults, `delegate`) is not read by any workflow and is the project's own convention. The coordinator
creates the missing ones at session start (`docs/COORDINATING.md` › Session start); it never applies the owner's.

## Headless plugin check (issue #69)

A non-interactive validation that detects whether Bive's plugins are discovered and loaded, without opening the
OpenCode UI. Command:

```
node .github/scripts/check-plugins.mjs <directory> <plugin-id> [<plugin-id> ...]
```

- Runs `opencode plugin list --standalone` in `<directory>` with a bounded timeout (60 s).
- Verifies each expected plugin ID is present with a real ID (not `-`).
- Exits 0 if all pass, 1 if any are missing or rejected, 2 on usage error.
- Project-specific plugin IDs are passed as arguments, not hardcoded in Bive.

## Local and manual checks (not GitHub statuses)

These are run by people or agents on their own machine. They are **not** GitHub required statuses and do not appear as
commit checks on a pull request.

- **Fast checks (delegate)**: lint and the tests of the files touched, for example
  `node --test tests/<the test of the file touched>.test.ts`.
- **Core checks (coordinator, once per batch of merges)**: `node --test tests/*.test.ts`; and
  `opencode plugin list` showing every Bive plugin with a real ID (not `-`), run after a session has started in the
  checkout.
- **Full checks (before a release)**: the two above, plus a fresh-clone install check where a write to
  `../outside.txt` is refused by the guard and `.bive/state/tokens.jsonl` fills.
- **`opencode plugin list`** is a local/manual check; it is not a GitHub required status.

## Coordinator merge exception (opt-in, off by default)

Default: a coordinator does not merge or close pull requests, and nothing is approved or merged into `main` but by the
owner. The owner may opt in, per app, a named parent coordinator for its direct sub-coordinator's pull requests into
`bived` or `milestone/*`, with a signed approval verified against a grant in `.bive/gate.json`; the gate then accepts
it instead of the dated label. `coordinatorMerges` ships `false` and no grant exists. Contract:
[docs/COORDINATOR-MERGES.md](COORDINATOR-MERGES.md).

## Reusing CI as evidence (issue #227)

A run substitutes a per-PR local run only with: the reviewed head SHA, the run URL and check name, the tested (or
synthetic merge) SHA and its base, the trusted workflow, the whole suite, the result and the skipped markers. Stale,
partial, skipped, missing or untrusted runs do not. The batch core run stays local. See
`docs/COORDINATING.md` › *Reuse complete trusted CI evidence*.

## What this document does not say

- It does not prove which checks GitHub branch protection currently requires, nor that any check is marked
  "required" in repository settings. Branch protection and rulesets are configured under the repository's settings;
  compare them against the checks listed here.
- It does not say who merges: by default the owner alone, after the coordinator's approval (`AGENTS.md` › Roles). An
  advisor's text or a collaborator/shared account is not approval; a bench pass is capability evidence only. A future,
  opt-in grant may let a named parent coordinator merge its direct sub-coordinator's pull requests into integration
  branches (off by default; [docs/COORDINATOR-MERGES.md](COORDINATOR-MERGES.md)).
- Workflow job names are part of the check identity. If a workflow or job is renamed, update this document and the
  repository's branch-protection configuration together so they keep matching.