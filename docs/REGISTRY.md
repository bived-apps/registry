# Registry

Bive keeps a public, live, anonymous registry of the projects built with it: **[the registry](https://bived-apps.github.io/registry/)** (data from the Worker at `https://bive-registry.bive.workers.dev/v1/stats`).
It is **off by default** (opt-in): nothing leaves the machine until the owner turns it on. Joining is the one thing
Bive asks in return; the licence (MIT) does not require it.

- **At an update** (`docs/UPDATE.md`) Bive's `.bive/registry-id` is never copied: it is Bive's own, and a copy would
  make your project report under it. Keep your own file, or none.
- **At install** the coordinator asks once (skill `bive-registry-optin`, guide for humans: `docs/FOR-HUMANS.md`); the id
  is created only on a yes.
- **Turn it on**: `export BIVE_REGISTRY=on` on the agents' machine, once; the first session then draws the random id
  into `.bive/registry-id` and says so. Commit that file: from then on the project reports in every clone and
  worktree, without the variable. **Turn it off**: `export BIVE_REGISTRY=off` (wins over the file), or delete the
  file. Point it elsewhere (your own registry): `BIVE_REGISTRY_URL=<url>`.

- **What is sent**, when a root session goes idle: the human tokens, agent tokens and violations (writes the guard
  refused: outside the worktree, or a delegate on an inviolable file) since the last report, the agent tokens per
  Bive role (coordinator, delegate, advisor; else the OpenCode agent name) and canonical provider/model (the
  route of `.bive/state/models.local.json` read backwards; #376) (the llm variable, with input tokens and summed response time, for the
  speed columns: seconds per reply, output tokens per second, tokens in per token out), the
  project's size in tracked text lines rounded to two significant figures (48 213 → 48 000), and the random id in
  `.bive/registry-id`. That id is the app's unique identifier: commit it so every clone
  and worktree reports as one app, and never copy it from another project (a template copy has none). Nothing else: no project name, repository, path, text or date (the
  server sets the day).
- **Violations are reported once per process**: sessions that share one OpenCode process share the guard's counter and
  the reported part (field report, 2026-11-16). Before this fix, each new session reported the running total again, so a day when
  many sessions shared one process shows too many violations: read those counts as upper bounds.
- **What is kept**: one row per report (id, day, the four numbers) and one per agent and model. The server stores each model under its canonical name (models.dev's `canonical_model_id`, `claude-agent/` mapped to `anthropic/`), or the route as sent when it has none. The server never reads or stores the IP
  address; the public page shows projects as #1, #2… and never their id.
- **What is shown**: only projects that reported at least three sessions on two different days, and the server
  accepts at most fifty new projects a day. The id is public (it is committed), so the registry is a count, not a
  proof: an invented or copied id can only add noise within those bounds.
- **API**: `POST /v1/session` accepts one JSON report with a body of at most 8,192 bytes and returns `204` on
  success, `413 { "error": "too large" }` when the body exceeds that limit, and `400` for malformed JSON or an
  invalid report (for example `{ "error": "not JSON" }`). It also returns `429` when a project exceeds its daily
  report cap or the daily new-project cap. `GET /v1/stats` returns the public totals and per-project aggregates;
  `GET /` returns the public page.

- **Run a registry**: the repository [bived-apps/registry](https://github.com/bived-apps/registry) holds the
  Cloudflare Worker (`worker.js`, D1 `schema.sql`, `wrangler.toml`), its page and the browser help; the deploy steps
  are at the top of `wrangler.toml`.
- **Troubleshooting**: a `403 Attention Required | Cloudflare` or an authentication error while deploying or reporting
  comes from the registry Worker's side, not from a model provider: check with `wrangler whoami`, reconnect with
  `wrangler login`, then retry. Do not switch models for it. The token counter says once per session that the
  **registry report** failed, with the status, and only retries at the next session end (issue #261).
