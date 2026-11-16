# Bive-managed skill provisioning — contract (draft)

Status: **accepted** (owner, 2026-11-12: D1–D10 as recommended). Implemented in lib/skill-provisioning.ts and lib/skill-permissions.ts (#136–#150).
This document is the provisioning contract the implementation satisfies.
It is written against OpenCode 2.2.5 skill/agent behaviour as researched for this issue.

## 1. Purpose and scope

Bive projects can carry reusable OpenCode skills. Isolated worktrees and remote agent
environments may not expose the same skill set or revision, and installing skills
globally makes project-specific guidance global and prone to drift.

This contract makes a project's OpenCode skills available to every Bive-managed
role session — advisor, coordinator, delegate — on both local and remote
machines, **without editing the user's global OpenCode configuration**, and
reports the source and revision used. The advisor answers questions read-only and
is not a chain of authority.

Out of scope: authoring skills, global skill installation, changing OpenCode's
native skill discovery/precedence, and any change to Bive's inviolable files.

## 2. Native OpenCode facts this contract relies on

(Verified against OpenCode 2.2.5 docs and `opencode debug config`.)

- Skill discovery sources, low to high precedence:
  1. built-in skills
  2. `.claude/skills` (global first, then farthest ancestor to current dir)
  3. `.agents/skills` (global first, then farthest ancestor to current dir)
  4. `~/.config/opencode/skills`
  5. project `.opencode/skills` (project root to current dir)
  6. explicit `skills` entries in `opencode.json(c)` (config priority, array order)
- Project sources walk from the current directory up to the git worktree root and
  include matching directories at every level.
- A skill ID is path-derived and case-sensitive (`git-release`); frontmatter
  `name` is only a display label. Flat `*.md` at a source root and nested
  `*/SKILL.md` are both skills; a directory containing `SKILL.md` is one skill.
- Skills are loaded on demand through the native `skill` tool; permitted skills
  with a description are advertised at each model step.
- Skill permission action is `skill`, resource is the skill ID; effects
  `allow` / `ask` / `deny`; per-agent override under `agents.<id>.permissions`.
- Extra sources can be added through the `skills` array in `opencode.json(c)`:
  relative paths (resolved from the active working directory, not the config file),
  `~/` paths, absolute paths, or HTTP catalogs (base URL + `index.json` with
  `{name, version, files}`; files downloaded from `<base>/<name>/<file>`; safe
  relative same-origin paths; `version` increment refreshes the cache).
- Remote sessions are created with `POST /api/session` carrying
  `location.directory`; skill discovery on that machine follows that directory's
  walk-up to its worktree root.
- OpenCode exposes no native source/revision field for a skill. Revision
  reporting is Bive's responsibility.
- Skills belong to the session's working directory and agent permissions, not to
  a model ID. Any model serving a role must receive the same role-scoped set.

## 3. Roles and scoping

Bive has three roles: `advisor`, `coordinator`, `delegate`. Each runs in its
own session (and, for delegates, its own worktree). A skill set is attached to a
**role**, never to a model ID or an individual agent name. The advisor answers
questions about the current worktree read-only and is not a standing manager,
launcher or approval rung.

- The role of a session is determined by the agent it runs under (`delegate`
  agent for delegates; the coordinator/advisor agent or session metadata for
  the others) or by Bive's session creation call, not by the model.
- Every model that serves a role receives that role's full skill set and the same
  permissions. A fallback to another model (`.bive/models.json`) does not change
  the skill set.
- Role scoping is enforced through the native `skill` permission: a role agent
  is configured to `allow` only its role's skill IDs and `deny` the rest, so a
  delegate cannot load a coordinator-only skill even if it is present on disk.

## 4. Skill manifest (declaration)

A project declares its Bive-managed skills in a single file, `.bive/skills.json`,
committed in the repository. It is the source of truth for *which* skills each
role receives and *where* they come from.

Proposed shape:

```json
{
  "version": 1,
  "roles": {
    "advisor":     ["bive-advisor-notes"],
    "coordinator": ["bive-coordinator-flow", "bive-pr-review"],
    "delegate":    ["bive-delegate-brief", "bive-guard-rules"]
  },
  "skills": {
    "bive-delegate-brief": {
      "source": "project",
      "path": ".opencode/skills/bive-delegate-brief",
      "revision": "<git blob sha or content hash>"
    }
  }
}
```

- `roles.<role>` is an ordered list of skill IDs.
- `skills.<id>.source` is one of `project`, `catalog` (HTTP), or `path`
  (explicit directory).
- `skills.<id>.path` is relative to the project root for `project`/`path`
  sources, or the catalog entry name for `catalog`.
- `skills.<id>.revision` is the expected revision recorded at declaration time
  (see section 6).
- A skill ID may appear in several roles' lists (shared skill). It is still
  provisioned once per worktree and reported once per session, tagged with every
  role that uses it.
- Skills present under `.opencode/skills` but not listed in the manifest are
  treated as user-authored project skills: Bive does not provision, report, or
  restrict them, and never overwrites them.

## 4a. Role migration (issue #262)

The valid roles are `advisor`, `coordinator`, `delegate`. A manifest that still
declares the old `supervisor` role fails validation (fail closed); it is not
silently migrated. Moving an old manifest to the new role set requires an explicit
owner review of each skill assignment: map `supervisor` skills to `advisor` (or
drop them) only after checking that each skill is appropriate for a read-only
advisor session. Never blindly rename `supervisor` to `advisor` or auto-load the
old set.

## 5. Provisioning (local and remote)

Provisioning is the step that makes the declared skill set available to a session
and verifies it. It runs before the session's first prompt.

### 5.1 Local sessions

- Delegates run in `.worktrees/issue-<n>` inside the checkout. Project sources
  walk from that directory up to the worktree (repository) root, so skills
  committed under the root's `.opencode/skills` are already discoverable.
- Provisioning for a local session:
  1. Resolve the role's skill IDs from `.bive/skills.json`.
  2. For each ID, verify the skill file exists at its declared path and that its
     content hash matches `revision` (section 6).
  3. If a role needs a skill that is not already on the walk-up path (for
     example a skill brought in from an explicit directory), add that directory
     to the session's project-local `skills` configuration without touching the
     user's global config, or copy the skill directory into
     `.opencode/skills/<id>` under the project root.
  4. Write the revision report (section 6).
- Provisioning never writes outside the project/worktree root. For delegates this
  is enforced by the worktree guard; for all roles it is a contract rule.

### 5.2 Remote sessions

- A remote session is created with `location.directory` pointing at a checkout on
  the remote machine.
- Before creating the session, Bive ensures that checkout contains the declared
  skills at the declared revisions:
  - Preferred: the checkout is a clone at the same commit as the local project,
    so `.opencode/skills` and `.bive/skills.json` are already present; Bive only
    verifies hashes.
  - Fallback: Bive pushes a skill bundle (a tarball of the declared skill
    directories) into a Bive-approved directory inside that checkout
    (`<checkout>/.opencode/skills/` or a configured `skills` path) and verifies
    each file's hash against `revision`.
- Bive never writes to the remote machine outside the approved checkout
  directory, and never modifies the remote user's global OpenCode config.
- If the remote checkout cannot be brought to the declared revisions, the session
  is **not** created and the failure is reported (section 7).

### 5.3 What provisioning does not do

- It does not install skills globally (`~/.config/opencode/skills` is never
  written).
- It does not delete or overwrite user-authored skills (section 4).
- It does not change OpenCode's native precedence; it relies on it and reports
  when a managed ID is shadowed or overrides another (section 8).

## 6. Source and revision reporting

Every managed session receives a revision report listing, for each provisioned
skill:

- skill ID
- role(s) it serves
- source (`project` / `catalog` / `path`) and its concrete origin (relative path
  or catalog URL + entry)
- revision: the git blob SHA of the skill file when the source is a git checkout,
  otherwise the SHA-256 of the skill directory's contents (all files, sorted by
  path, including supporting files)
- the session's role
- a single `source_revision` summary for the whole set (the commit SHA of
  `.bive/skills.json` in the project repository, or its content hash when not in
  git)

Delivery:

- The report is written to `<worktree>/.bive/skills.report.json` (gitignored,
  generated) so a human or tool can read it.
- The report is also injected into the session as a synthetic system message at
  session start, so the model and the user see which skills and revisions are
  active. (Alternative: a session instruction entry; see section 10, D9.)

The report is the mechanism by which "Bive reports the source and revision/hash
used for each managed session" (issue #132) is satisfied.

## 7. Missing-skill failure

A declared skill that cannot be provisioned is a hard failure, not a silent
fallback:

- If the skill file is absent, unreadable, or its hash does not match
  `revision`, provisioning fails and the session is not started.
- The failure message names the skill ID, the role, the expected revision, the
  observed hash (or "missing"), and the path/origin checked.
- For delegates this is surfaced in the delegate's report and blocks the issue;
  for coordinator/advisor sessions it blocks the start of that role's work and
  is logged.
- There is no automatic substitution of a similarly named skill and no silent
  use of a stale copy. A stale copy may be used only if `.bive/skills.json`
  declares the new revision and provisioning is re-run successfully.

## 8. Conflict handling

Native OpenCode precedence (section 2) means a later source wins for a given ID.
Bive adds explicit handling on top:

- **Managed vs. managed:** two managed skills may not share an ID.
  `.bive/skills.json` is invalid if `skills` contains duplicate IDs, or if the
  same ID is declared with two different sources/revisions. Provisioning refuses
  to run.
- **Managed vs. user-authored:** if a managed skill ID collides with a
  user-authored skill present on disk (same ID, different content), provisioning
  fails by default and reports both sources and their hashes. The project may
  resolve it by either (a) renaming, or (b) declaring an explicit override in
  `.bive/skills.json` (`"override": true` on that skill), which makes Bive use
  the managed copy and record the override in the report.
- **Managed vs. global/compatibility sources:** if a global or compatibility
  source (e.g. `~/.claude/skills`) defines the same ID as a managed skill,
  provisioning reports it as a shadowing warning. It does not fail unless the
  managed skill ends up not being the one loaded (i.e. the managed source is not
  the highest-precedence source for that ID). In that case it fails with the same
  detail as section 7.
- **Catalog version conflicts:** an HTTP catalog entry's `version` must match the
  recorded revision's expected version. A mismatch is treated as a missing-skill
  failure (section 7), not a silent refresh.

Conflict reports always include both IDs' origins and hashes so the owner can
decide.

## 9. Path safety

- Provisioning writes only under Bive-approved paths:
  - `<project or worktree root>/.opencode/skills/`
  - `<project or worktree root>/.bive/` (manifest, report, state)
  - an explicitly configured approved directory inside a remote checkout
- It never writes to `~/.config/opencode/`, `~/.claude/`, `~/.agents/`, or any
  path outside the project/worktree root or the approved remote directory.
- HTTP catalog downloads validate that every file path is safe (relative, no `..`,
  no absolute, same-origin) and reject oversized payloads (limit TBD, see section 10).
- Delegates remain subject to the worktree guard; provisioning code running as a
  delegate uses only relative paths inside the worktree.
- Remote provisioning uses a single approved base directory per checkout and
  refuses to follow symlinks that escape it.

## 10. Decision points for the owner

These need an explicit decision before implementation. Recommendations are given.

- **D1 — Manifest format/location.** Recommendation: `.bive/skills.json` (JSON),
  consistent with `.bive/models.json`, machine-readable. Alternative:
  `.bive/SKILLS.md` (Markdown), consistent with the "Options as Markdown" idea.
  *Owner to decide.*
- **D2 — Role-to-skill mapping.** Recommendation: explicit list in the manifest
  (section 4), not convention-based directories, so a skill can be shared across
  roles without path tricks. *Owner to decide.*
- **D3 — Copy vs. verify locally.** Recommendation: verify in place for local
  sessions (worktree shares the repo root), copy only when an explicit external
  directory is declared. Avoids duplicate skill trees. *Owner to decide.*
- **D4 — Remote transport.** Recommendation: prefer same-commit clone (verify
  only); skill bundle push as fallback. *Owner to decide whether HTTP catalogs
  are allowed as a source at all.*
- **D5 — Failure mode.** Recommendation: hard fail (section 7). No degraded session.
  *Owner to decide.*
- **D6 — Conflict policy.** Recommendation: fail by default, explicit override
  opt-in (section 8). *Owner to decide.*
- **D7 — Permission enforcement.** Recommendation: deny non-role skills in the
  role agent's `skill` permission (section 3). *Owner to decide whether advisor/
  coordinator should instead allow all project skills.*
- **D8 — Revision granularity.** Recommendation: per-skill content hash plus a
  single `source_revision` summary (section 6). *Owner to decide.*
- **D9 — Report delivery.** Recommendation: both a file (`.bive/skills.report.json`)
  and a synthetic system message at session start. *Owner to decide whether an
  instruction entry is preferred over a synthetic message.*
- **D10 — Size limit for catalog downloads.** Recommendation: 1 MiB per skill
  directory. *Owner to decide.*

## 11. Tests required by the implementation (future)

- Role-scoped availability: a delegate session advertises exactly its role's
  skills and cannot load a coordinator-only skill.
- Revision consistency: local and remote sessions report identical hashes for the
  same commit.
- Conflict handling: duplicate managed IDs, managed/user collision, and
  global-shadowing cases fail or warn as specified.
- Remote-session fixture: a session created against a remote checkout with a
  missing skill fails before the first prompt.
- Path safety: provisioning makes no write outside approved paths (extend the
  worktree-guard test style).

## 12. Non-goals and constraints

- No change to Bive's inviolable files; if any must change, report it.
- No global OpenCode config edits.
- No new Bive package or CLI; provisioning is glue over OpenCode's sessions,
  agents, permissions, and (for remotes) its server API.
- Nothing enters the template that a role or a human does not read during a task;
  `.bive/skills.json` and the report are read by provisioning and by reviewers.
