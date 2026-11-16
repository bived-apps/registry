import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CATALOGUE_URL,
  TTL_MS,
  RETRY_MS,
  FETCH_TIMEOUT_MS,
  CLAUDE_AGENT_SHORT,
  buildCanonicalMap,
  canonicalName,
  createCanonicalizer,
} from "../canonical.js"

test("models.dev: the three examples of #13 map as stated", () => {
  const catalogue = {
    opencode: { models: { "minimax-m3.1-flash-free": { canonical_model_id: "minimax/MiniMax-M3.1-Flash" } } },
    openrouter: { models: { "nvidia/nemotron-3-ultra-550b-a55b:free": { canonical_model_id: "nvidia/nemotron-3-ultra-550b-a55b" } } },
    "opencode-go": { models: { "beam-free": { canonical_model_id: "reflection/beam-1.0-501b-a23b" } } },
  }
  const map = buildCanonicalMap(catalogue)
  assert.equal(map.size, 3)
  assert.equal(canonicalName("opencode/minimax-m3.1-flash-free", map), "minimax/MiniMax-M3.1-Flash")
  assert.equal(canonicalName("openrouter/nvidia/nemotron-3-ultra-550b-a55b:free", map), "nvidia/nemotron-3-ultra-550b-a55b")
  assert.equal(canonicalName("opencode-go/beam-free", map), "reflection/beam-1.0-501b-a23b")
})

test("claude-agent routes map through CLAUDE_AGENT_SHORT and claude- prefixes", () => {
  const map = new Map()
  assert.equal(canonicalName("claude-agent/claude-opus-5-5", map), "anthropic/claude-opus-5-5")
  for (const [short, full] of Object.entries(CLAUDE_AGENT_SHORT)) {
    assert.equal(canonicalName(`claude-agent/${short}`, map), full)
  }
  // all four short names explicitly
  assert.equal(CLAUDE_AGENT_SHORT.opus, "anthropic/claude-opus-5-5")
  assert.equal(CLAUDE_AGENT_SHORT.sonnet, "anthropic/claude-sonnet-5-5")
  assert.equal(CLAUDE_AGENT_SHORT.haiku, "anthropic/claude-haiku-5-5")
  assert.equal(CLAUDE_AGENT_SHORT.fable, "anthropic/claude-fable-5-2")
})

test("no canonical id: routes come back as sent", () => {
  const catalogue = {
    openrouter: { models: { "openrouter/free": {} } },
  }
  const map = buildCanonicalMap(catalogue)
  assert.equal(canonicalName("openrouter/openrouter/free", map), "openrouter/openrouter/free")
  assert.equal(canonicalName("some/unknown-route", map), "some/unknown-route")
  assert.equal(canonicalName("some/unknown-route", undefined), "some/unknown-route")
})

test("failure path: fetch failures leave routes as sent and retry is suppressed", async () => {
  const cases = [
    async () => { throw new Error("boom") },
    async () => ({ ok: false, status: 500, json: async () => ({}) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json") } }),
  ]
  for (const makeFetch of cases) {
    let calls = 0
    const fetch = async () => { calls++; return makeFetch() }
    const logs: string[] = []
    const log = (m: string) => logs.push(m)
    const c = createCanonicalizer({ fetch, now: () => 0, log })
    const out = await c.names(["openrouter/foo", "claude-agent/opus"])
    assert.deepEqual(out, ["openrouter/foo", "anthropic/claude-opus-5-5"])
    assert.equal(logs.length, 1)
    // second call within RETRY_MS does not fetch
    const out2 = await c.names(["openrouter/foo"])
    assert.deepEqual(out2, ["openrouter/foo"])
    assert.equal(calls, 1)
  }
})

test("cache: two calls within TTL fetch once; after TTL fetch again", async () => {
  let t = 0
  let calls = 0
  const fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({}) } }
  const c = createCanonicalizer({ fetch, now: () => t, log: () => {} })
  await c.names(["x"])
  t = 1000
  await c.names(["x"])
  assert.equal(calls, 1)
  t = TTL_MS + 1
  await c.names(["x"])
  assert.equal(calls, 2)
})

test("buildCanonicalMap throws TypeError for non-objects", () => {
  for (const v of [null, "x", 5, undefined, true]) {
    assert.throws(() => buildCanonicalMap(v as any), TypeError)
  }
})

test("constants are exported", () => {
  assert.equal(CATALOGUE_URL, "https://models.dev/api.json")
  assert.equal(TTL_MS, 24 * 3600 * 1000)
  assert.equal(RETRY_MS, 3600 * 1000)
  assert.equal(FETCH_TIMEOUT_MS, 5000)
})