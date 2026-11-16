import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Pure check: given the parsed output of `opencode plugin list` and the expected plugin IDs,
// return { ok, missing, rejected } describing which expected plugins are absent or have no
// real ID (ID "-"). Used by the headless plugin check (issue #69).
export function checkPlugins(pluginList, expected = []) {
  const byId = new Map()
  for (const row of pluginList || []) {
    if (row && typeof row.id === "string") byId.set(row.id, row)
  }
  const missing = []
  const rejected = []
  for (const id of expected) {
    const row = byId.get(id)
    if (!row) missing.push(id)
    else if (!row.id || row.id === "-" || row.version === "-") rejected.push(id)
  }
  return { ok: missing.length === 0 && rejected.length === 0, missing, rejected }
}

function runOpencodePluginList(directory, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    execFile("opencode", ["plugin", "list", "--standalone"], {
      cwd: directory, timeout: timeoutMs, maxBuffer: 1024 * 1024, encoding: "utf8",
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`opencode plugin list failed: ${(stderr || error.message).trim()}`, { cause: error }))
        return
      }
      resolve(stdout)
    })
  })
}

export function parsePluginList(stdout) {
  const rows = []
  // Expected format: "ID  VERSION  SOURCE" header, then rows.
  const lines = stdout.split(/\r?\n/)
  let headerSeen = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^ID\s+VERSION\s+SOURCE/i.test(trimmed)) { headerSeen = true; continue }
    if (!headerSeen) continue
    const parts = trimmed.split(/\s{2,}/)
    if (parts.length >= 2) {
      rows.push({ id: parts[0], version: parts[1], source: parts.slice(2).join(" ") })
    }
  }
  return rows
}

async function main() {
  const directory = process.argv[2] || process.cwd()
  const expected = process.argv.slice(3)
  if (expected.length === 0) {
    console.error("usage: node check-plugins.mjs <directory> <plugin-id> [<plugin-id> ...]")
    process.exitCode = 2
    return
  }
  let stdout
  try {
    stdout = await runOpencodePluginList(directory)
  } catch (error) {
    console.error(`bive check-plugins: ${error.message}`)
    process.exitCode = 1
    return
  }
  const list = parsePluginList(stdout)
  const result = checkPlugins(list, expected)
  if (result.ok) {
    console.log(`bive check-plugins: OK (${expected.length} plugin(s) loaded)`)
    for (const id of expected) console.log(`  - ${id}: loaded`)
  } else {
    console.error("bive check-plugins: FAIL")
    for (const id of result.missing) console.error(`  - ${id}: missing`)
    for (const id of result.rejected) console.error(`  - ${id}: rejected (id/version "-")`)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`bive check-plugins: ${error.message}`)
    process.exitCode = 1
  })
}