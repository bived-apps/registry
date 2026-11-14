import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const html = readFileSync(new URL("../help/index.html", import.meta.url), "utf8")

test("the assistant tab is named Advisor", () => {
  assert.match(html, /<button role="tab" id="tab-sup"[^>]*>Advisor<\/button>/)
  assert.ok(!html.includes("Supervisor assistant"))
})

test("the system prompt makes the owner the only decider", () => {
  assert.ok(html.includes("You advise the human owner"))
  assert.ok(html.includes("never approve, merge, close or release"))
  assert.ok(html.includes("evidence, not the owner's authorization"))
  assert.ok(!html.includes("You assist the supervisor"))
})

test("gate 2 never hands a delegate's work to the coordinator", () => {
  assert.ok(!html.includes("the coordinator does it"))
  assert.ok(html.includes("decided by the owner"))
})

test("the docs come from the bived branch and name ADVISOR.md", () => {
  assert.ok(html.includes("https://raw.githubusercontent.com/bived-apps/bive/bived/"))
  assert.ok(html.includes(".bive/prompts/ADVISOR.md"))
  assert.ok(!html.includes("SUPERVISOR.md"))
  assert.ok(!html.includes("jcherfils/bive/main"))
})
