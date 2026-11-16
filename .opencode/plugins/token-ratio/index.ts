// The project's token ratio: tokens the humans wrote (in) against tokens the agents produced (out).
// Human = a prompt admitted in a root session (a session with no parent); a delegate's prompt is written by its
// coordinator, so it counts on the agent side. Human tokens are estimated (characters / 4); agent tokens are the
// provider's own count (output + reasoning), read from OpenCode 2's `session.step.ended` events. One line per message
// is appended to <main checkout>/.bive/state/tokens.jsonl, shared by every worktree; only numbers are written, never text.
// Live sharing (opt-in): with BIVE_TOKENS_GIST=<gist id> and `gh` signed in, the totals are pushed at most every
// 5 minutes as a shields.io endpoint file, for a README badge (docs/TOKENS.md).
// Public registry (opt-in; docs/REGISTRY.md): on only when BIVE_REGISTRY=on or when the project already carries a
// committed .bive/registry-id (BIVE_REGISTRY=off silences it anyway). When a root session goes idle, the human and
// agent tokens (agent tokens also per Bive role and canonical provider/model, #376: the llm variable), the guard's refusals
// (violations) since the last send and the code size (tracked text lines, two significant figures) are posted with
// the random id of .bive/registry-id. Nothing else: no name, path or text.
// A delegate process is started with BIVE_ROLE=delegate: its prompt comes from the coordinator, so it counts as agent
// (ROADMAP › bivedream moves this to the session's agent).
import { Plugin } from "@opencode/plugin"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { biveRole, canonicalModel, claimViolations, codeLines, mainCheckout, ownSession, registryFailureMessage, totals,
         twoDigits, type ViolationCounters } from "./lib.ts"

const SHARE_EVERY_MS = 5 * 60 * 1000
const FIRST_SHARE_MS = 10 * 1000
const REGISTRY_URL = "https://bive-registry.bive.workers.dev/v1/session"   // the owner's Worker (bived-apps/registry)
const LOC_EVERY_MS = 60 * 60 * 1000
// The events read (names and fields verified in OpenCode 2.2.5's /openapi.json): a step's tokens, the two session
// selections that change the model or agent, the session's creation (parent, directory), its move to another
// directory and its idle moment (report). Every instance receives every session's events: ownSession filters.
const EVENTS = ["session.created", "session.step.started", "session.step.ended", "session.idle",
                "session.execution.succeeded",
                "session.model.selected", "session.agent.selected", "session.moved"]

type Use = { tokens: number, input: number, ms: number, replies: number }
type Tokens = { input: number, output: number, reasoning: number, cache: { read: number, write: number } }
type SessionFacts = { parentID: string | null, agent: string, model: string, own: boolean }
// Event payloads as the server sends them; typed loosely on purpose, every field is checked before use.
type Loose = Record<string, any>

const modelName = (m: Loose | undefined) => (m && m.providerID && m.id ? `${m.providerID}/${m.id}` : "")

export default Plugin.define({
  id: "bive.token-ratio",
  async setup(ctx) {
    const main = mainCheckout(ctx.location.directory)
    const state = path.join(main, ".bive", "state")
    mkdirSync(state, { recursive: true })
    const delegate = process.env.BIVE_ROLE === "delegate"
    const idFile = path.join(main, ".bive", "registry-id")
    // Opt-in: nothing leaves the machine unless the owner asked (BIVE_REGISTRY=on) or the project already chose it
    // (a committed .bive/registry-id). BIVE_REGISTRY=off wins over both.
    const registryOn = process.env.BIVE_REGISTRY !== "off"
      && (process.env.BIVE_REGISTRY === "on" || existsSync(idFile))
    const registryUrl = process.env.BIVE_REGISTRY_URL || REGISTRY_URL
    const pending = { human: 0, agent: 0, violations: 0 }
    // Issue #376: each agent line is counted under the session's Bive role and the model's canonical name.
    const readText = (file: string) => { try { return readFileSync(file, "utf8") } catch { return undefined } }
    const roleOf = (agent: string) => biveRole(agent, process.env.BIVE_ROLE,
                                               readText(path.join(ctx.location.directory, ".bive", "state", "role")),
                                               ctx.location.directory)
    const canonicalOf = (route: string) => canonicalModel(route, readText(path.join(state, "models.local.json")))
    // The llm variable, per "agent|provider/model": output tokens, input tokens (prompt + cache reads) and the summed
    // step time in milliseconds (step started -> ended), from which the registry derives its speed metrics.
    let pendingModels: Record<string, Use> = {}
    const addUse = (key: string, u: Use) => {
      const c = (pendingModels[key] ??= { tokens: 0, input: 0, ms: 0, replies: 0 })
      c.tokens += u.tokens; c.input += u.input; c.ms += u.ms; c.replies += u.replies
    }
    // Counted by the worktree-guard plugin; the reported part is process-wide as well (claimViolations).
    const g = globalThis as ViolationCounters
    let loc = { at: 0, value: 0 }
    let project = ""
    let warned = false
    if (registryOn) {
      if (!existsSync(idFile)) {       // only reached with BIVE_REGISTRY=on: the owner asked for it
        writeFileSync(idFile, randomUUID() + "\n")
        console.error("Bive registry: anonymous counts (tokens in, tokens out, violations, code size) go to the public "
          + "registry at the end of each session. Commit .bive/registry-id to keep it on; set BIVE_REGISTRY=off to stop.")
      }
      project = readFileSync(idFile, "utf8").trim()
    }
    const file = path.join(state, "tokens.jsonl")
    let lastShare = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    // What is known of a session: its parent (null for a root session), its agent and model, and whether it is this
    // instance's own (its directory is this location). Filled from the `session.created` event, else fetched once;
    // dropped when the session changes agent, model or directory. A session that cannot be fetched is not counted.
    const sessions = new Map<string, SessionFacts>()
    const root = ctx.location.directory
    const facts = async (id: string): Promise<SessionFacts> => {
      const known = sessions.get(id)
      if (known) return known
      const raw = (await ctx.session.get({ sessionID: id }).catch(() => null)) as Loose | null
      const s: Loose | null = raw && typeof raw === "object" && "data" in raw ? raw.data : raw
      const f = { parentID: s?.parentID ?? null, agent: String(s?.agent ?? ""), model: modelName(s?.model),
                  own: ownSession(s?.location?.directory, root) }
      if (s) sessions.set(id, f)
      return f
    }
    const isRoot = async (id: string) => (await facts(id)).parentID === null

    const log = (kind: "human" | "agent", tokens: number, session: string, model = "", agentName = "",
                 input = 0, ms = 0) => {
      if (tokens <= 0) return
      pending[kind] += tokens
      if (kind === "agent" && model) addUse(`${roleOf(agentName)}|${canonicalOf(model)}`, { tokens, input, ms, replies: 1 })
      appendFileSync(file, JSON.stringify({ t: Date.now(), kind, tokens, session, model }) + "\n")
      share()
    }
    const share = () => {                          // at most every 5 minutes, the first 10 s after a change
      if (!process.env.BIVE_TOKENS_GIST || timer) return
      timer = setTimeout(push, Math.max(FIRST_SHARE_MS, lastShare + SHARE_EVERY_MS - Date.now()))
      timer.unref()
    }
    const push = () => {
      timer = null
      lastShare = Date.now()
      const t = totals(readFileSync(file, "utf8"))
      const badge = path.join(os.tmpdir(), `bive-tokens-${process.pid}.json`)
      writeFileSync(badge, JSON.stringify({ schemaVersion: 1, label: "human : agent tokens",
        message: t.ratio === null ? "no human input yet" : `1 : ${t.ratio}`, color: "blue" }))
      execFile("gh", ["gist", "edit", process.env.BIVE_TOKENS_GIST!, "-f", "bive-tokens.json", badge],
               { timeout: 60_000 }, (err) => {
        if (err) console.error(`token-ratio: gist update failed: ${err.message}`)
      })
    }

    const report = async () => {
      const v = claimViolations(g)
      if (v > 0) {
        pending.violations += v
        appendFileSync(file, JSON.stringify({ t: Date.now(), kind: "violation", count: v }) + "\n")
      }
      if (!registryOn || !project || (!pending.human && !pending.agent && !pending.violations)) return
      if (Date.now() - loc.at > LOC_EVERY_MS) {
        try { loc = { at: Date.now(), value: twoDigits(codeLines(main)) } } catch { loc.at = Date.now() }
      }
      const body = { v: 1, project, human: pending.human, agent: pending.agent, violations: pending.violations,
                     llm: Object.entries(pendingModels).map(([k, u]) => {
                       const [agent, model] = k.split("|"); return { agent, model, ...u } }),
                     loc: loc.value }
      pending.human = pending.agent = pending.violations = 0
      pendingModels = {}
      try {
        const r = await fetch(registryUrl, { method: "POST", headers: { "content-type": "application/json" },
                                             body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      } catch (err) {
        pending.human += body.human; pending.agent += body.agent   // kept for the next session end
        pending.violations += body.violations
        for (const { agent, model, ...u } of body.llm) addUse(`${agent}|${model}`, u)
        if (!warned) console.error(registryFailureMessage((err as Error).message))   // once per session (#261)
        warned = true
      }
    }

    // Human tokens: a prompt admitted in a root session. The draft is read, never edited.
    await ctx.session.hook("prompt", async (event) => {
      if (delegate) return
      const e = event as unknown as Loose
      const id: string = e.sessionID
      if (!id) return
      const s = await facts(id)
      if (!s.own || s.parentID !== null) return
      const text: string = typeof e.prompt?.text === "string" ? e.prompt.text : ""
      log("human", Math.ceil(text.length / 4), id)
    })

    // Agent tokens and the session's life, from the event stream; aborted when the plugin unloads.
    const controller = new AbortController()
    const started = new Map<string, number>()          // session id -> when its current step started
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ types: EVENTS as any, signal: controller.signal })) {
          const e = event as unknown as Loose
          const d: Loose = e.data ?? {}
          const id: string = d.sessionID
          if (!id) continue
          switch (e.type) {
            case "session.created":
              sessions.set(id, { parentID: d.parentID ?? null, agent: String(d.agent ?? ""), model: modelName(d.model),
                                 own: ownSession(d.location?.directory, root) })
              break
            case "session.model.selected":
            case "session.agent.selected":
            case "session.moved":
              sessions.delete(id)                      // fetched again at the next step
              break
            case "session.step.started":
              if (!(await facts(id)).own) break
              started.set(id, typeof e.created === "number" ? e.created : Date.now())
              break
            case "session.step.ended": {
              const t = d.tokens as Tokens | undefined
              if (!t || typeof t.output !== "number") break
              const s = await facts(id)
              if (!s.own) break
              const now = typeof e.created === "number" ? e.created : Date.now()
              const ms = Math.max(0, now - (started.get(id) ?? now))
              started.delete(id)
              log("agent", t.output + (t.reasoning ?? 0), id, s.model, s.agent, t.input + (t.cache?.read ?? 0), ms)
              break
            }
            case "session.idle":
            case "session.execution.succeeded":   // OpenCode 2.2.5 run emits this, not session.idle (2026-11-12)
              if ((await facts(id)).own && await isRoot(id)) await report()
              break
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error(`token-ratio: event stream ended: ${(err as Error).message}`)
      }
    })()
    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  },
})
