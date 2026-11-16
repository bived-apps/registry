// Canonical model names for the registry: models.dev's canonical_model_id, with a
// built-in table for the claude-agent/ routes (same table as Bive's
// .opencode/plugins/token-ratio/lib.ts, bive#411).
export const CATALOGUE_URL = "https://models.dev/api.json";
export const TTL_MS = 24 * 3600 * 1000;
export const RETRY_MS = 3600 * 1000;
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

export function createCanonicalizer({ fetch, now = Date.now, log = console.warn } = {}) {
  let state = null;        // { map, at } on success
  let failureAt = null;
  let pending = null;

  async function tryFetch() {
    const t = now();
    const cacheValid = state !== null && t - state.at < TTL_MS;
    if (cacheValid) return;
    if (failureAt !== null && t - failureAt < RETRY_MS) return;
    if (pending) {
      await pending;
      return;
    }
    pending = (async () => {
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
        const map = buildCanonicalMap(parsed);
        state = { map, at: now() };
        failureAt = null;
      } catch (err) {
        const reason = (err && typeof err.message === "string" && err.message !== "")
          ? err.message : String(err);
        log(`registry: models.dev catalogue unavailable (${reason}); storing routes as sent`);
        failureAt = now();
      } finally {
        pending = null;
      }
    })();
    await pending;
  }

  return {
    async names(routes) {
      try {
        await tryFetch();
      } catch {
        // names never throws
      }
      const map = state ? state.map : undefined;
      return (Array.isArray(routes) ? routes : []).map((r) => canonicalName(r, map));
    },
  };
}