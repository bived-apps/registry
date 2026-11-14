# Bive registry

Bive's registry: the Cloudflare Worker (`worker.js`, D1 `schema.sql`, `wrangler.toml`; deploy steps at the top of
`wrangler.toml`), its public page (`index.html`) and the browser help (`help/`). Moved out of
[bived-apps/bive](https://github.com/bived-apps/bive) at `bived` ce9763e (ROADMAP 0.1 › 5); the client stays in bive's
`.opencode/plugins/token-ratio/`.

Tests: `node --test tests/*.test.ts`
