import { Database } from "bun:sqlite";

export const MIGRATIONS: string[] = [
  `
CREATE TABLE agents (
  name       TEXT PRIMARY KEY,
  device     TEXT NOT NULL DEFAULT 'unknown',
  kind       TEXT NOT NULL DEFAULT 'agent' CHECK (kind IN ('agent','subagent')),
  status     TEXT NOT NULL DEFAULT 'idle',
  connected  INTEGER NOT NULL DEFAULT 0,
  last_seen  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE agent_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash      TEXT NOT NULL UNIQUE,
  agent_name    TEXT NOT NULL REFERENCES agents(name),
  kind_override TEXT CHECK (kind_override IN ('agent','subagent') OR kind_override IS NULL),
  created_by    TEXT NOT NULL DEFAULT 'human',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  revoked_at    TEXT
);
CREATE TABLE agent_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('connect','disconnect','status')),
  meta       TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  `
CREATE TABLE profiles (
  name TEXT PRIMARY KEY,
  display_name TEXT,
  emoji TEXT,
  kind TEXT NOT NULL DEFAULT 'permanent' CHECK (kind IN ('permanent','one-shot')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','liberated')),
  model_default TEXT,
  provider_default TEXT,
  device TEXT,
  last_onboarded TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
`,
  `
CREATE TABLE souls (
  profile_name TEXT PRIMARY KEY REFERENCES profiles(name),
  soul_md TEXT,
  personality_tags TEXT,
  tool_restrictions TEXT,
  canon_ref TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);
`,
  `
CREATE TABLE skills (
  name TEXT PRIMARY KEY,
  description TEXT,
  category TEXT,
  content_hash TEXT,
  path TEXT,
  required_toolsets TEXT,
  updated_at TEXT
);
CREATE TABLE profile_skills (
  profile_name TEXT NOT NULL REFERENCES profiles(name),
  skill_name TEXT NOT NULL REFERENCES skills(name),
  pinned INTEGER NOT NULL DEFAULT 0,
  added_at TEXT,
  PRIMARY KEY (profile_name, skill_name)
);
`,
  `
CREATE TABLE memory_mirror (
  profile_name   TEXT NOT NULL REFERENCES profiles(name),
  target         TEXT NOT NULL CHECK (target IN ('memory','user')),
  content        TEXT,
  char_count     INTEGER NOT NULL DEFAULT 0,
  content_hash   TEXT,
  last_synced    TEXT,
  sync_direction TEXT NOT NULL DEFAULT 'local_primary' CHECK (sync_direction IN ('local_primary','cardinal_primary','bidirectional')),
  PRIMARY KEY (profile_name, target)
);
`,
  `
CREATE TABLE sessions_index (
  id            TEXT PRIMARY KEY,
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  title         TEXT,
  model         TEXT,
  started_at    REAL,
  message_count INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0
);
`,
  `
CREATE TABLE rag_cache (
  cache_key  TEXT PRIMARY KEY,
  query      TEXT NOT NULL,
  top_k      INTEGER NOT NULL DEFAULT 5,
  results    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  `
CREATE TABLE config_templates (
  profile_name TEXT PRIMARY KEY REFERENCES profiles(name),
  config_yaml TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);
`,
];

export function migrate(db: Database): void {
  const row = db.query("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function createDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}
