# Handoff

What anyone picking up the work needs to know. Kept current by the coordinator, once per batch (see AGENTS.md).

## Goal

The public, anonymous registry of projects built with Bive: a Cloudflare Worker that receives session counts from
Bive's `token-ratio` plugin and serves them, and the page (`index.html`, `help/`) that shows them (bived-apps/bive
`docs/REGISTRY.md`).

## Running it

- Tests: `node --test tests/*.test.ts` (Node 22).
- Deploy: the owner's step only, from the comments at the top of `wrangler.toml`.

## Decisions

- **Bive install (owner, 2026-11-16)**: Bive v0.2.4 installed (gate, guard, role prompts); integration branch `bived`;
  no `.bive/registry-id`.
- **Canonical model names (owner, 2026-11-16, #13, #17)**: a report stores `claude-agent/` routes under `anthropic/`
  at once (Bive's `CLAUDE_AGENT_SHORT`) and every other route as sent; it makes no network call. A daily Cron Trigger
  (`scheduled`, 03:17 UTC, `wrangler.toml`) fetches models.dev (5 s timeout) and renames each stored route that has a
  `canonical_model_id` (`canonical.js` › `refreshCanonicalNames`). A new route shows as sent for up to a day. The
  `MODEL` check applies to the input only. Workers Paid plan: parsing the 6.7 MB catalogue takes ~90 ms of CPU
  (machine A), over the Free plan's 10 ms.

## Tasks

GitHub issues are the source of truth.

## Watch out

- Never commit a Cloudflare secret or account id; no workflow deploys.
- Pages serves `main`: work lands on `bived` first and reaches the site when `bived` is merged into `main`.

## Session log

- 2026-11-16, install/bive: Bive v0.2.4 installed (coordinator anthropic/claude-opus-5-5).
- 2026-11-16, #13 (PR #14): canonical model names (delegate opencode-go/beam-free; coordinator
  anthropic/claude-opus-5-5). Core checks on bived 0080b80: 25 pass. Deployed (owner).
- 2026-11-16, #17 (PR #18): the catalogue leaves the report path; a daily cron renames stored rows (delegate
  opencode-go/beam-free; coordinator anthropic/claude-opus-5-5). Core checks on bived 0bcc2db: 26 pass. Deployed (owner).
