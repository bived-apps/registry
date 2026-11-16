// Canonical model names for the registry: models.dev's canonical_model_id, with a
// built-in table for the claude-agent/ routes (same table as Bive's
// .opencode/plugins/token-ratio/lib.ts, bive#411). The catalogue is read by the
// daily cron, never by a report.
export const CATALOGUE_URL = "https://models.dev/api.json";
export const FETCH_TIMEOUT_MS = 5000;

export const CLAUDE_AGENT_SHORT = {
  opus: "anthropic/claude-opus-5-5",
  sonnet: "anthropic/claude-sonnet-5-5",
  haiku: "anthropic/claude-haiku-5-5",
  fable: "anthropic/claude-fable-5-2",
};

export function buildCanonicalMap(catalogue) {
  if (catalogue === null || typeof catalogue !== "object" || Array.isArray(catalogue)) {
    throw new TypeError("catalogue must be an object");
  }
  const map = new Map();
  for (const [provider, info] of Object.entries(catalogue)) {
    if (info === null || typeof info !== "object" || Array.isArray(info)) continue;
    const models = info.models;
    if (models === null || typeof models !== "object" || Array.isArray(models)) continue;
    for (const [id, entry] of Object.entries(models)) {
      const canonical = (entry && typeof entry === "object" && !Array.isArray(entry))
        ? entry.canonical_model_id : undefined;
      if (typeof canonical === "string" && canonical !== "") {
        map.set(`${provider}/${id}`, canonical);
      }
    }
  }
  return map;
}

export function canonicalName(route, map) {
  const slash = route.indexOf("/");
  if (slash === -1) {
    // No provider segment: still consult the map, then fall back to the route.
    if (map && typeof map.has === "function" && map.has(route)) return map.get(route);
    return route;
  }
  const provider = route.slice(0, slash);
  const rest = route.slice(slash + 1);
  if (provider === "claude-agent") {
    if (rest.startsWith("claude-")) return `anthropic/${rest}`;
    if (Object.prototype.hasOwnProperty.call(CLAUDE_AGENT_SHORT, rest)) {
      return CLAUDE_AGENT_SHORT[rest];
    }
    return route;
  }
  if (map && typeof map.has === "function" && map.has(route)) return map.get(route);
  return route;
}

export async function fetchCanonicalMap({ fetch, log = console.warn } = {}) {
  try {
    const res = await fetch(CATALOGUE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res || !res.ok) {
      throw new Error(res ? `HTTP ${res.status}` : "no response");
    }
    let parsed;
    try {
      parsed = await res.json();
    } catch (err) {
      throw err;
    }
    return buildCanonicalMap(parsed);
  } catch (err) {
    const reason = (err && typeof err.message === "string" && err.message !== "")
      ? err.message : String(err);
    log(`registry: models.dev catalogue unavailable (${reason}); nothing renamed`);
    return null;
  }
}

export async function renameStored(db, map) {
  const { results } = await db.prepare("SELECT DISTINCT model FROM llm").all();
  const statements = [];
  for (const row of (results || [])) {
    const model = row.model;
    const name = canonicalName(model, map);
    if (name !== model) {
      statements.push(db.prepare("UPDATE llm SET model = ? WHERE model = ?").bind(name, model));
    }
  }
  if (statements.length) {
    await db.batch(statements);
  }
  return statements.length;
}

export async function refreshCanonicalNames(env, { fetch, log = console.warn } = {}) {
  try {
    const map = await fetchCanonicalMap({ fetch, log });
    if (map === null) return 0;
    return await renameStored(env.DB, map);
  } catch (err) {
    const reason = (err && typeof err.message === "string" && err.message !== "")
      ? err.message : String(err);
    log(`registry: renaming models failed (${reason})`);
    return 0;
  }
}