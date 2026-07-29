import type { Database } from "bun:sqlite";
import type { AgentKind, AgentRow, AgentKeyRow, AgentEventRow } from "@cardinal/core";

export function registerAgent(db: Database, name: string, kind: AgentKind): void {
  db.run("INSERT INTO agents (name, kind) VALUES (?, ?) ON CONFLICT(name) DO NOTHING", [name, kind]);
}

export function upsertAgentOnConnect(
  db: Database,
  args: { name: string; device: string; kind: AgentKind; status: string },
): void {
  db.run(
    `INSERT INTO agents (name, device, kind, status, connected, last_seen)
     VALUES (?, ?, ?, ?, 1, datetime('now'))
     ON CONFLICT(name) DO UPDATE SET
       device = excluded.device,
       kind = excluded.kind,
       status = excluded.status,
       connected = 1,
       last_seen = datetime('now')`,
    [args.name, args.device, args.kind, args.status],
  );
}

export function markAgentDisconnected(db: Database, name: string): void {
  db.run("UPDATE agents SET connected = 0, last_seen = datetime('now') WHERE name = ?", [name]);
}

export function updateAgentStatus(db: Database, name: string, status: string): void {
  db.run("UPDATE agents SET status = ?, last_seen = datetime('now') WHERE name = ?", [status, name]);
}

export function listAgents(db: Database): AgentRow[] {
  return db.query("SELECT * FROM agents ORDER BY name").all() as AgentRow[];
}

export function getAgent(db: Database, name: string): AgentRow | null {
  return (db.query("SELECT * FROM agents WHERE name = ?").get(name) as AgentRow | null) ?? null;
}

export function insertEvent(
  db: Database,
  args: { agentName: string; type: "connect" | "disconnect" | "status"; meta?: string },
): void {
  db.run("INSERT INTO agent_events (agent_name, type, meta) VALUES (?, ?, ?)", [
    args.agentName,
    args.type,
    args.meta ?? null,
  ]);
}

export function listEvents(db: Database, agentName: string, limit = 20): AgentEventRow[] {
  return db
    .query("SELECT * FROM agent_events WHERE agent_name = ? ORDER BY id DESC LIMIT ?")
    .all(agentName, limit) as AgentEventRow[];
}

export function createAgentKey(
  db: Database,
  args: { keyHash: string; agentName: string; kindOverride?: AgentKind; createdBy?: "human" | "system" },
): void {
  db.run("INSERT INTO agent_keys (key_hash, agent_name, kind_override, created_by) VALUES (?, ?, ?, ?)", [
    args.keyHash,
    args.agentName,
    args.kindOverride ?? null,
    args.createdBy ?? "human",
  ]);
}

export function findActiveKeyByHash(db: Database, keyHash: string): AgentKeyRow | null {
  return (
    (db
      .query("SELECT * FROM agent_keys WHERE key_hash = ? AND revoked_at IS NULL")
      .get(keyHash) as AgentKeyRow | null) ?? null
  );
}

export function touchKey(db: Database, id: number): void {
  db.run("UPDATE agent_keys SET last_used_at = datetime('now') WHERE id = ?", [id]);
}

export function revokeKeysForAgent(db: Database, agentName: string): void {
  db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE agent_name = ? AND revoked_at IS NULL", [
    agentName,
  ]);
}

export function listKeys(db: Database): AgentKeyRow[] {
  return db.query("SELECT * FROM agent_keys ORDER BY id").all() as AgentKeyRow[];
}
