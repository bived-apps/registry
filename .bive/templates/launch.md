# Launch #<milestone> <title>

<!-- Post this as ONE comment on the milestone's epic issue; its first line must stay `# Launch #...` so the launcher
     finds it (docs/COORDINATING.md › Start a coordinator). Never write it to a file outside your worktree. -->

Branch `milestone/<name>` · coordinator clone `<dir>` · model `<provider/model>`

Owner approval: <!-- link to the owner's explicit approval of this scope and concrete team; none = proposed, do not launch -->

Read: (mandatory; every list non-empty)

- Open issues: #<n>, #<n>, …
- Rule files: `AGENTS.md` › <section>, `.bive/prompts/COORDINATOR.md` › <step>, …
- Existing files: `<path>`, `<path>`, …

Fill-ins only: milestone, branch, model, the owner's narrowing. The rules live in AGENTS.md and the role prompt,
not here (see #118). A hand-over whose Read: is empty or missing is returned to the owner before any split.
Advisor-prepared text is only a proposal. A collaborator login, qualification or green check is not owner approval.
