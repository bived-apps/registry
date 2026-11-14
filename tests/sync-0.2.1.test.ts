import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8")

test("links point to bived-apps/bive, not the old owner repository", () => {
  for (const f of ["index.html", "README.md", "help/index.html"]) assert.ok(!read(f).includes("jcherfils/bive"), f)
})

test("no supervisor left in the help page (the role is retired; the advisor advises)", () => {
  assert.doesNotMatch(read("help/index.html"), /supervisor/i)
})

test("wrangler.toml says what a Cloudflare 403 means (bived-apps/bive#261)", () => {
  assert.match(read("wrangler.toml"), /403 Attention Required \| Cloudflare.*\n#.*wrangler whoami, then npx wrangler login/)
})
