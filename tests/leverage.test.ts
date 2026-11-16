import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const fmtStart = html.indexOf("const fmt = ")
const fmtLine = html.slice(fmtStart, html.indexOf(";\n", fmtStart) + 1)
const src = html.slice(html.indexOf("function mixHex"), html.indexOf("function drawLeverage"))

// Runs the page's own leverage() and fmt (pure: no document needed).
const leverage = new Function(`${fmtLine}\n${src}\nreturn leverage`)() as
  (rows: object[], paths: unknown[][], W: number, opt?: object) => string

const rows = [
  { human: 37788, agent: 1310301, violations: 2735, sessions: 304, loc: 24000, llm: "anthropic/claude-opus-5-5" },
  { human: 15195, agent: 784596, violations: 4387, sessions: 86, loc: 220000, llm: "claude-agent/haiku" },
]
const paths = [
  [["2026-11-12", 6752, 244392, 3500, 168], ["2026-11-15", 30000, 1000000, 20000, 2000], ["2026-11-16", 37788, 1310301, 24000, 2735]],
  [["2026-11-14", 4000, 200000, 200000, 900], ["2026-11-16", 15195, 784596, 220000, 4387]],
]

test("one dot and one label per project, a trail when it has history", () => {
  const svg = leverage(rows, paths, 900)
  assert.equal((svg.match(/<circle /g) || []).length, 2)
  assert.equal((svg.match(/<polyline /g) || []).length, 2)
  assert.match(svg, />#1</)
  assert.match(svg, />#2</)
})

test("the ratio guides are drawn and every coordinate is a number", () => {
  const svg = leverage(rows, paths, 900)
  assert.match(svg, /1 : 10</)
  assert.match(svg, /1 : 100</)
  assert.ok(!/NaN|Infinity|undefined/.test(svg))
})

test("the tooltip states the leverage and the violation rate", () => {
  const svg = leverage(rows, paths, 900)
  assert.match(svg, /#1: 1 human : 35 agent tokens, 9\.0 violations per session/)
})

test("the LLM filter keeps only matching projects, and no project gives a message", () => {
  assert.equal((leverage(rows, paths, 900, { filter: "claude-agent/haiku" }).match(/<circle /g) || []).length, 1)
  assert.match(leverage([], [], 900), /No project reported yet/)
})
