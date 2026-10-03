-- App state (projects, agents, templates, memory, history, preferences) is stored
-- as JSON documents keyed by store name. Split into relational tables later if
-- queries over run history need it.
CREATE TABLE IF NOT EXISTS kv_store (
  key         TEXT PRIMARY KEY NOT NULL,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
