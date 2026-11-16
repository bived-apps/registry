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

## Tasks

GitHub issues are the source of truth.

## Watch out

- Never commit a Cloudflare secret or account id; no workflow deploys.
- Pages serves `main`: work lands on `bived` first and reaches the site when `bived` is merged into `main`.

## Session log

- 2026-11-16, install/bive: Bive v0.2.4 installed (coordinator anthropic/claude-opus-5-5).
