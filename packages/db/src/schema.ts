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
