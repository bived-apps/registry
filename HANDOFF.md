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
- **Canonical model names (owner, 2026-11-16, #13)**: `POST /v1/session` stores each `llm[].model` under its canonical
  name (`canonical.js`: models.dev `canonical_model_id`, `claude-agent/` table as Bive's `CLAUDE_AGENT_SHORT`), else the
  route as sent. Catalogue fetched with a 5 s timeout, cached a day, retried an hour after a failure; a report is never
  refused because of it. The `MODEL` check applies to the input only. Workers Paid plan (parsing the 6.7 MB
  catalogue exceeds the Free plan's CPU limit).

## Tasks

GitHub issues are the source of truth.

## Watch out

- Never commit a Cloudflare secret or account id; no workflow deploys.
- Pages serves `main`: work lands on `bived` first and reaches the site when `bived` is merged into `main`.

## Session log

- 2026-11-16, install/bive: Bive v0.2.4 installed (coordinator anthropic/claude-opus-5-5).
- 2026-11-16, #13 (PR #14): canonical model names (delegate opencode-go/beam-free; coordinator
  anthropic/claude-opus-5-5). Core checks on bived 0080b80: 25 pass. Deploy pending (owner).
