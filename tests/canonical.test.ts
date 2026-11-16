import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CATALOGUE_URL,
  FETCH_TIMEOUT_MS,
  CLAUDE_AGENT_SHORT,
  buildCanonicalMap,
  canonicalName,
  fetchCanonicalMap,
  renameStored,
  refreshCanonicalNames,
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

test("fetchCanonicalMap: failures give null with one log; success gives the map", async () => {
  const catalogue = {
    opencode: { models: { "minimax-m3.1-flash-free": { canonical_model_id: "minimax/MiniMax-M3.1-Flash" } } },
  }
  const cases = [
    async () => { throw new Error("boom") },
    async () => ({ ok: false, status: 500, json: async () => ({}) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json") } }),
  ]
  for (const makeFetch of cases) {
    const fetch = async () => makeFetch()
    const logs: string[] = []
    const log = (m: string) => logs.push(m)
    const map = await fetchCanonicalMap({ fetch, log })
    assert.equal(map, null)
    assert.equal(logs.length, 1)
  }
  // good response
  const fetch = async () => ({ ok: true, status: 200, json: async () => catalogue })
  const logs: string[] = []
  const log = (m: string) => logs.push(m)
  const map = await fetchCanonicalMap({ fetch, log })
  assert.ok(map instanceof Map)
  assert.equal(map.size, 1)
  assert.equal(logs.length, 0)
})

test("renameStored: two updates, one batch, returns 2; nothing to rename: no batch, returns 0", async () => {
  // claude-agent/opus renamed via CLAUDE_AGENT_SHORT even without map; ensure map has opencode-go entry.
  const rows = [
    { model: "opencode-go/beam-free" },
    { model: "claude-agent/opus" },
    { model: "openrouter/openrouter/free" },
    { model: "minimax/MiniMax-M3.1-Flash" },
  ]
  const prepared: any[] = []
  const batches: any[] = []
  const db = {
    prepare(sql: string) {
      const stmt: any = { sql, bindArgs: null }
      stmt.bind = (...args: any[]) => { stmt.bindArgs = args; return stmt }
      stmt.all = async () => ({ results: rows })
      prepared.push(stmt)
      return stmt
    },
    batch: async (stmts: any[]) => { batches.push(stmts) },
  }
  // map must make canonicalName rename opencode-go and claude-agent/opus
  const renameMap = new Map([["opencode-go/beam-free", "reflection/beam-1.0-501b-a23b"]])
  const n = await renameStored(db as any, renameMap)
  assert.equal(n, 2)
  // prepared SQL: first SELECT, then two UPDATEs
  assert.equal(prepared[0].sql, "SELECT DISTINCT model FROM llm")
  const updates = prepared.slice(1)
  assert.equal(updates.length, 2)
  assert.equal(updates[0].sql, "UPDATE llm SET model = ? WHERE model = ?")
  assert.deepEqual(updates[0].bindArgs, ["reflection/beam-1.0-501b-a23b", "opencode-go/beam-free"])
  assert.equal(updates[1].sql, "UPDATE llm SET model = ? WHERE model = ?")
  assert.deepEqual(updates[1].bindArgs, ["anthropic/claude-opus-5-5", "claude-agent/opus"])
  assert.equal(batches.length, 1)
  assert.equal(batches[0].length, 2)

  // nothing to rename
  const rows2 = [{ model: "openrouter/openrouter/free" }]
  const prepared2: any[] = []
  const batches2: any[] = []
  const db2 = {
    prepare(sql: string) {
      const stmt: any = { sql, bindArgs: null }
      stmt.bind = (...args: any[]) => { stmt.bindArgs = args; return stmt }
      stmt.all = async () => ({ results: rows2 })
      prepared2.push(stmt)
      return stmt
    },
    batch: async (stmts: any[]) => { batches2.push(stmts) },
  }
  const n2 = await renameStored(db2 as any, new Map())
  assert.equal(n2, 0)
  assert.equal(batches2.length, 0)
})

test("refreshCanonicalNames: fetch failure -> 0 and no db call; batch reject -> 0, one log, no throw", async () => {
  // fetch failure
  const fetchFail = async () => { throw new Error("boom") }
  const dbCalls: string[] = []
  const db = {
    prepare(sql: string) { dbCalls.push(sql); return { all: async () => ({ results: [] }), bind: () => ({}) } }
  }
  const env = { DB: db }
  const logs1: string[] = []
  const r1 = await refreshCanonicalNames(env as any, { fetch: fetchFail, log: (m: string) => logs1.push(m) })
  assert.equal(r1, 0)
  assert.equal(dbCalls.length, 0)

  // batch rejecting
  const rows = [{ model: "opencode-go/beam-free" }, { model: "claude-agent/opus" }]
  const db2 = {
    prepare(sql: string) {
      const stmt: any = { sql, bindArgs: null }
      stmt.bind = (...args: any[]) => { stmt.bindArgs = args; return stmt }
      stmt.all = async () => ({ results: rows })
      return stmt
    },
    batch: async () => { throw new Error("db boom") },
  }
  const env2 = { DB: db2 }
  const fetchOk = async () => ({ ok: true, status: 200, json: async () => ({ "opencode-go": { models: { "beam-free": { canonical_model_id: "reflection/beam-1.0-501b-a23b" } } } }) })
  const logs2: string[] = []
  const r2 = await refreshCanonicalNames(env2 as any, { fetch: fetchOk, log: (m: string) => logs2.push(m) })
  assert.equal(r2, 0)
  assert.equal(logs2.length, 1)
})

test("buildCanonicalMap throws TypeError for non-objects", () => {
  for (const v of [null, "x", 5, undefined, true]) {
    assert.throws(() => buildCanonicalMap(v as any), TypeError)
  }
})

test("constants are exported", () => {
  assert.equal(CATALOGUE_URL, "https://models.dev/api.json")
  assert.equal(FETCH_TIMEOUT_MS, 5000)
})