# Self-hosted runner mode

A project with one self-hosted runner (a single machine that keeps its state) breaks in ways GitHub-hosted CI does
not. This page gathers the rules from the related issues in one checklist. Bive's own CI assumes a fresh
`ubuntu-latest` machine per job; a project on a self-hosted runner runs the same checks on a persistent machine and
must follow the rules below.

## Checklist (run when a project adds a self-hosted runner)

1. **Runner health before a milestone** (#116): the runner is online before the first delegate starts.
   - Self-hosted: `gh api repos/<owner>/<repo>/actions/runners` (needs admin rights; without them, ask the owner to
     check the runner status in GitHub's settings).
   - Hosted runners: no check needed; GitHub provides them.
   If the runner is offline, tell the owner and do not start delegates.
2. **Runtime version matches** (#116): the runtime version of the project's local environment equals the one installed
   now. The project fills the command in `AGENTS.md` › Before committing (Bive's own: `node --version` is 22). A
   mismatch means the environment was built with another interpreter version.
3. **Fast checks green on the base** (#116): the fast checks have been seen green once on the milestone's base, in CI,
   before the first delegate starts. A red base blocks all other merges until green.
4. **CI environment isolated from the machine** (#121): keep the environment inside the job (rebuild on demand, no
   shared caches or installed packages leaking between runs).
5. **Tests declare the machine they depend on** (#122): markers/reserved runners for machine-dependent tests.
6. **Owner's agreement before a changed workflow runs on the machine** (#123): a changed workflow needs the owner's
   agreement before it runs on the self-hosted runner.
7. **The gate does not hold the only runner** (#129): `bive-merge-gate` no longer polls; a pending check gives an
   immediate red that a `workflow_run` re-run turns green. The gate must not run on the same runner label as the
   checks it waits for.
8. **Owner override when CI is down** (#115): the owner's `bive-owner-override-YYYY-MM-DD` label is the only way to
   merge past a non-green gate; it never covers a red check.
9. **A red base is read and listed by cause** (#115): after every push to `bived` or `milestone/*`, the full suite runs
   on the new base; a failing run opens (or comments on) an issue `Base red: <branch> at <sha>` with the run link.
10. **Coordinators at once from runner capacity** (#126): at most as many coordinators as runners able to take the fast
    checks (and never more than two); each coordinator keeps at most one CI run in flight.
11. **No workflow on a self-hosted label uses `pull_request` without a base checkout** (file-level check).
12. **The gate does not run on the same runner label as the checks it waits for** (file-level check).

## File-level checks (run in `node --test tests/*.test.ts`)

- No workflow on a self-hosted label uses `pull_request` without a base checkout.
- The gate does not run on the same runner label as the checks it waits for (the gate runs on `ubuntu-latest`).

See `tests/self-hosted.test.ts` (if present) for the scripted checks.