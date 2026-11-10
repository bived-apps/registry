-- The Bive registry: one row per reported session. No IP, name, path or text is ever stored.
CREATE TABLE IF NOT EXISTS sessions (
  project TEXT NOT NULL,      -- random id from the project's .bive/registry-id
  day     TEXT NOT NULL,      -- UTC date set by the server (YYYY-MM-DD)
  human   INTEGER NOT NULL,   -- human tokens since the last report (estimated)
  agent   INTEGER NOT NULL,   -- agent tokens since the last report (provider counts)
  violations INTEGER NOT NULL DEFAULT 0,  -- writes the guard refused since the last report
  loc     INTEGER NOT NULL    -- tracked text lines, rounded to two significant figures
);
CREATE INDEX IF NOT EXISTS sessions_project_day ON sessions (project, day);
CREATE INDEX IF NOT EXISTS sessions_day ON sessions (day);

-- The llm variable: agent tokens per agent name and provider/model, one row per pair of a report.
CREATE TABLE IF NOT EXISTS llm (
  project TEXT NOT NULL,
  day     TEXT NOT NULL,
  agent   TEXT NOT NULL,      -- the OpenCode agent's name: coordinator, delegate, build, plan…
  model   TEXT NOT NULL,      -- "provider/model" as OpenCode names it
  tokens  INTEGER NOT NULL,   -- agent tokens (output + reasoning)
  input   INTEGER NOT NULL DEFAULT 0,   -- input tokens (prompt + cache reads)
  ms      INTEGER NOT NULL DEFAULT 0,   -- summed response time, created -> completed
  replies INTEGER NOT NULL DEFAULT 0    -- number of responses
);
CREATE INDEX IF NOT EXISTS llm_project ON llm (project);
