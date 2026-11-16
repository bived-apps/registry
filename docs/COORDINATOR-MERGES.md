# Exceptional coordinator merges

Generic to **any app made with Bive**, not a repository-specific privilege. The owner alone holds supervisory
authority. A coordinator may execute one named direct sub-coordinator PR merge only through the opt-in path below.
An advisor has no workflow privileges; a qualification is capability evidence, never a grant.

## Default off; one opt-in, then one of two modes (owner, 2026-11-15, #344)

1. The app's human owner explicitly opts in, through a reviewed change to `.bive/gate.json` on the PR's **base**,
   naming one mode: `{"owner": "<human login>", "skippable": [], "coordinatorMerges": true,
   "coordinatorMergeMode": "label"}` (or `"grant"`). Missing, invalid or false `coordinatorMerges` means disabled; a
   missing or unknown mode is refused. Bive ships `false`; this task does not enable it.
2. Each mode is enough on its own; the tool runs only the named mode's checks and never falls back to the other. Every
   refusal after the mode is read starts with it: `[label] …` or `[grant] …`.
   - **`label`, one merge at a time**: the owner applies the normal dated PR authorization
     (`bive-merge-authorized-until-YYYY-MM-DD`, still valid today in UTC) and waits for the required checks and the
     gate to pass; the tool then asks the exact-scope OpenCode permission prompt (`bive.coordinator.merge`, `ask` in
     `opencode.jsonc`), which the owner answers. Before the gate is green it neither prompts nor merges. Nothing is
     saved for a later call (`save: []`), and the prompt's resource carries the head. Explicit deny rules still win;
     an `allow` rule for `bive.coordinator.merge` would skip the prompt, so keep it `ask`. Grants on the base are
     ignored, by the tool and by the gate.
   - **`grant`, a listed batch**: the signed grant below; no prompt for each merge. A dated label alone does not
     authorize in this mode.

In `label` mode the prompt names repository, PR, exact head, base, executing coordinator session, direct sub-coordinator session and
expiry (two minutes from request preparation). It covers only that tool invocation. Reject it if you are not the app's
human owner, the request is incomplete, or the scope is not the work you intend to authorize. Silence is not consent.
An owner asking for advice, saying "coordinator decides", or approving a team does not issue this merge permission.

## Requesting execution

The executor must be an actual `coordinator` session. The child must be another actual `coordinator` session whose
server-recorded `parentID` is the executor, in its own clone/worktree. Session names quoted in PR text are not proof.
The PR is labelled `coordinator`, open, same-repository, and based on `bived` or `milestone/<name>`.

Use the session-bound Git identities in `AGENTS.md` before either coordinator authors commits:

```text
coordinator <canonical provider/model> [session=<actual session id>]
```

Never rename an identity to hide authorship. An executor cannot merge its own current branch or work it authored.
Unknown authorship or old coordinator author names without session attribution fail closed; the owner merges those
PRs manually. No history rewriting to make a PR eligible.

Invoke `bive_coordinator_merge` with the PR number and `childSession`. The tool derives the repository and executor,
reads opt-in and the named owner from the remote base, verifies the actual child's branch/head against the PR, checks
authorship and the owner authorization's latest label event, and reruns the gate. It requires every check to pass,
except the existing inviolable-check skip on a `coordinator` PR. Owner overrides do not let this tool merge red,
missing or pending checks.

After the owner answers the permission prompt (`label`) or the parent's approval is recorded (`grant`), it reads the scope, opt-in, labels and checks again. Changed head/base,
owner, relationship, branch, expired/revoked authorization or timeout refuses the operation. It executes only
`gh pr merge --merge --match-head-commit <head>`, with the exact repository and PR. A second invocation needs a new
owner decision; a merged/closed PR is ineligible. Removing the authorization or disabling base opt-in revokes pending
requests when their final validation runs.

## What it never permits

- No general merge right, self-merge, arbitrary PRs, inherited grant or onward delegation.
- No direct push, squash/rebase, PR closure, owner-authorization action or label application by agents.
- No approval of work, teams or gates, test release, provider fallback or billing changes.
- No advisor or delegate execution; changing a role name in the request does not make it a coordinator session.
- No change to the general shell merge/close denials in `opencode.jsonc`.

## Enforcement limits and verification

The path uses OpenCode 2's tool, permission and session APIs and bounded `gh`/Git subprocesses. Pure and injected
adapter tests must not authorize or perform a real merge. A live end-to-end merge is a separate owner-run acceptance
step; do not infer it from unit tests or enable opt-in just to test.

The existing shared-GitHub-account caveat remains: a login cannot prove which person or agent used its credentials.
This path adds a fresh local human permission boundary, but is not an OS sandbox or a defence against a malicious
operator with unrestricted server/credential access. Keep private credentials and owner-only authorization workflows
out of agent control. A check and its subsequent GitHub merge are not an atomic transaction: require branch protection
and retain GitHub's pinned-head check. Do not describe this helper as a replacement for repository protections.

Install/update this feature from reviewed Bive source, including the protected guard files and permission rule.
Do not copy grants, permissions, session IDs or another app's owner identity into a new installation. Opt-in remains
an independent decision by each app's owner.

## Main is the owner's alone; `grant` mode: parent approval of direct children (owner, 2026-11-13)

- No agent approves or merges into `main`, under any grant. The code refuses it (`coordinator-merge.ts`) and the
  grant reader ignores any grant whose base is not `bived` or `milestone/<name>`.
- The owner's opt-in is a grant in `.bive/gate.json` on the protected base (`coordinatorMergeGrants`): repository,
  executor session, direct child sessions and branches, base, expiry, maximum approvals, and a public key. Only the
  owner changes that file, so an agent cannot widen it. A PR that touches it, or any other authority or enforcement
  file, is merged by the owner.
- Within a grant, the parent coordinator approves its direct child's PR head with a signed, short-lived comment
  (`coordinator-approval-lib.mjs` verifies it). No manual label and no owner prompt per PR. Never its own PR or work
  it authored.
- Status: implemented and tested: the grant reader, the signed approval, the `main` refusal, the merge tool
  (`merge-tool.ts`, signs with `BIVE_PARENT_APPROVAL_KEY`, posts the comment, asks GitHub to re-run the gate) and the
  gate (`check-merge-gate.mjs` accepts the approval instead of the dated label, `tests/gate-parent-approval.test.ts`).
  Verified offline end to end (owner's choice, 2026-11-14): `tests/coordinator-merge-tool.test.ts` runs the real tool, signing,
  grant lookup and gate against a fake GitHub. Not verified live on GitHub. Opt-in stays off (`coordinatorMerges: false`) and no grant exists.
- `label` mode (#344): implemented and tested offline (`tests/coordinator-merge-tool.test.ts`, the label tests), and
  verified live once on 2026-11-15 on a scratch repository: a child coordinator's PR, the owner's dated label, a green
  gate, the owner's yes at the prompt, then a merge commit by the App. Not tested live: the owner's *no*, and `grant` mode.
  The tool checks Bive's own CI names and never merges into `main` (#395).
