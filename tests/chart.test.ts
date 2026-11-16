import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const src = html.slice(html.indexOf("function chart(days) {"), html.indexOf("\n}\n", html.indexOf("function chart(days) {")) + 2)

// Runs the page's own chart() with a box of the given client size (what the browser measures).
function render(clientWidth: number, clientHeight: number, days: object[]): string {
  const document = { getElementById: () => ({ clientWidth, clientHeight }) }
  const fmt = (n: number) => String(n)
  return new Function("document", "fmt", "days", `${src}\nreturn chart(days)`)(document, fmt, days)
}

const days = [
  { day: "2026-11-12", agent: 244392, human: 6752, sessions: 56, violations: 168 },
  { day: "2026-11-15", agent: 1000393, human: 27588, sessions: 224, violations: 2598 },
]

test("the chart keeps its height whatever the box held before (it once shrank to 23 px)", () => {
  for (const h of [0, 23, 180, 400]) {
    const svg = render(903, h, days)
    assert.match(svg, /<svg width="903" height="180"/, `box height ${h}`)
  }
})

test("no bar has a negative height", () => {
  const svg = render(903, 23, days)
  const heights = [...svg.matchAll(/<rect [^>]*height="([^"]+)"/g)].map((m) => Number(m[1]))
  assert.equal(heights.length, 4)
  for (const h of heights) assert.ok(h >= 0, `height ${h}`)
})
