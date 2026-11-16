# <Project>

<!-- One line: what it does for you. -->

Start here: [Install and run](#install-and-run) · Read next: [What to read](#what-to-read)

<!-- One paragraph: what it does, for whom. -->

## Install and run

<!-- The commands. -->

## Development

Built with [Bive](https://github.com/bived-apps/bive): agents write, you decide.

| | Role | In this project |
| --- | --- | --- |
| <img src="https://raw.githubusercontent.com/bived-apps/bive/main/docs/design/role-owner.svg" width="24" alt="Owner glyph: a key in a gold ring"> | **owner** | decides gates and merges |
| <img src="https://raw.githubusercontent.com/bived-apps/bive/main/docs/design/role-advisor.svg" width="24" alt="Advisor glyph: a magnifier"> | **advisor** | answers read-only, then stops |
| <img src="https://raw.githubusercontent.com/bived-apps/bive/main/docs/design/role-coordinator.svg" width="24" alt="Coordinator glyph: a clipboard"> | **coordinator** | splits, briefs, reviews; never merges |
| <img src="https://raw.githubusercontent.com/bived-apps/bive/main/docs/design/role-delegate.svg" width="24" alt="Delegate glyph: a laptop"> | **delegate** | one issue, one worktree, then stops |

One issue = one worktree = one pull request. Rules in `AGENTS.md`, state in `HANDOFF.md`, plan in `ROADMAP.md`. Run project CI on pull requests and
pushes to the default and integration branches so a red base is visible promptly. Projects on a
self-hosted runner follow `docs/SELF-HOSTED.md`.

## What to read

- **To run the software**: this README, then the project's own docs. Nothing else.
- **To start an agent**: `AGENTS.md` (roles and rules), then `.bive/prompts/` for the role you run. `HANDOFF.md`
  is state a newcomer needs (how to run, current decisions), not a restatement of the rules and not a merge journal;
  session logs and superseded decisions leave it on a schedule the template names. `docs/COORDINATING.md` stays the
  long form, in Bive, not copied into every project until it is longer than the architecture.
