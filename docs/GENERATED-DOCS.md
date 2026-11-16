# Generated reference docs in pull requests

Bive does not ship a generator or generated data. A project that has generated reference pages
(`docs/IMPORTS.md`, `docs/CONSTANTS.md`, or any other generated file) declares its generator
command and generated paths, and Bive provides a reusable workflow that runs the generator on
every pull request and keeps the generated pages in sync.

## Declaration

A project declares its generator in `.bive/generated-docs.json` at the repository root:

```json
{
  "command": "node scripts/generate-docs.mjs",
  "paths": ["docs/IMPORTS.md", "docs/CONSTANTS.md"],
  "timeout_minutes": 5
}
```

- `command`: the shell command that regenerates the declared paths. It runs from the repository root.
- `paths`: the files the generator writes (relative to the repository root). Only these are committed back.
- `timeout_minutes`: bounded timeout for the generator (default 5, max 15).

If `.bive/generated-docs.json` is absent, the workflow does nothing.

## Workflow

`.github/workflows/bive-generated-docs.yml` runs on `pull_request` (default activity types) for
branches targeting the integration branch. It:

1. Checks out the pull request head.
2. Reads `.bive/generated-docs.json`; if absent, exits successfully.
3. Runs the generator command with the declared timeout.
4. If any declared path changed, commits the change to the pull request branch (using the
   repository's default `GITHUB_TOKEN`, which has write access to the PR branch for same-repo PRs).
5. Reports which files changed in the job summary.

Permissions: `contents: write` (to push the commit) and `pull-requests: read`. No `actions: write`.

## Forked pull requests

For pull requests from forks, the workflow does not push commits (GitHub does not grant write
access to fork branches). Instead it posts the generated diff as a comment on the pull request
and fails if the declared paths are stale, so the contributor can regenerate locally. The
coordinator (or the contributor) re-runs the generator and pushes.

## Duplicate and concurrent runs

- A `concurrency` group per pull request (`bive-generated-docs-<pr_number>`) with
  `cancel-in-progress: true` prevents duplicate runs on the same PR.
- The generator must be idempotent: running it twice produces no extra diff. The workflow
  checks this by running the generator a second time and failing if the second run changes
  anything.

## Idempotency

Repeated workflow runs produce no extra diff. The generator is expected to be deterministic:
same inputs, same outputs. If a run changes a file that the generator did not declare, the
workflow fails (only declared paths may change).

## What Bive does not do

- Bive does not ship a generator or generated data. The generator command and its inputs are
  the project's.
- Bive does not use a Git hook. The workflow is the only automation.
- Bive does not copy generated files into the template. A project that wants this pattern
  declares its own generator and paths.