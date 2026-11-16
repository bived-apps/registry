---
name: bive-pick-model
description: Before a batch, or after a model error, check which models of .bive/models.json work on this machine and take the next one; keep the commit naming the model that ran. Use whenever a delegate or the coordinator must choose or switch models.
---

# Picking a model

`.bive/models.json` lists models per role, best first. What it cannot say is which of them work *here, now*.

## Check (before a batch, and after any model error)

1. Run `node lib/models-check-cli.ts` from the root. It reads `.bive/models.json`, the optional local aliases
   (`.bive/state/models.local.json`) and `opencode models`, and prints per role: `found`, `alias <resolved>` or
   `MISSING (closest <x>)`, then `ok` or `NO USABLE MODEL FOR <role>`. Exit status 1 means a role has none.
2. It sends nothing. To learn which models also *answer* (a quota used up, a dead provider, no credit), add `--probe`:
   one tiny prompt per role's first usable model. Use it after an error, not on every start: it costs tokens.
3. `MISSING`: use the closest match it names if the owner agrees, or put the right id in
   `.bive/state/models.local.json` (`docs/PROVIDERS.md` › Per-machine model aliases). Never edit `.bive/models.json` to
   make a check pass.

## Take the next model

- An error that says *usage limit*, *rate limit*, *429*, *credit balance*, *insufficient*, *billing*, *not found* or
  *timeout* is a **model error**: move to the next model of the role, resolved through the alias, and name it in your
  review. Any other error is not a reason to change model: read it.
- Mid-work: continue the delegate's own session on the next model with one short message and set the worktree's Git
  identity to that model first (`docs/PROVIDERS.md` › Switching mid-work). The identity is the **canonical** name,
  never the alias, so `git log` shows which model wrote each commit.
- If every model of the role failed, stop and tell the owner which failed and why (`bive-ask-owner`).

## Never

- Probe every model OpenCode knows (no automatic provider search by default).
- Start the coordinator role on a model that is not on the `coordinator` list (`docs/PROVIDERS.md` › Minimum for the
  coordinator).
