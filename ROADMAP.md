# Roadmap

The plan, in enough detail that another agent can take any item. Kept strictly in sync with the code: every change
here is committed with the code it describes (an item started → `doing`, finished → `done in <commit>`).

## Principles

- Anonymous counts only: no IP, no client clock, no name. A project is listed only after 3 sessions on 2 days.
- The Worker and the page stay small, with no dependencies; the owner deploys.

## Epics

### 1. Bive install (owner) — done in 243f83d, S
- Bive v0.2.4's gate, guard and role prompts (install/bive).

### 2. Canonical model names (owner) — done in 0bcc2db, S
- Each model appears under its canonical name (`canonical.js`): `claude-agent/` at report time, the rest renamed by a
  daily cron from models.dev (#13, #17). Deployed.
