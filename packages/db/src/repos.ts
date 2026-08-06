import type { Database } from "bun:sqlite";
import type {
  AgentKind,
  AgentRow,
  AgentKeyRow,
  AgentEventRow,
  ProfileKind,
  ProfileRow,
  ProfileStatus,
  SoulRow,
} from "@cardinal/core";

export type {
  AgentKind,
  AgentRow,
  AgentKeyRow,
  AgentEventRow,
  ProfileKind,
  ProfileRow,
  ProfileStatus,
  SoulRow,
};

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

export function listProfiles(db: Database): ProfileRow[] {
  return db.query("SELECT * FROM profiles ORDER BY name").all() as ProfileRow[];
}

export function getProfile(db: Database, name: string): ProfileRow | null {
  return (db.query("SELECT * FROM profiles WHERE name = ?").get(name) as ProfileRow | null) ?? null;
}

export interface ProfileFields {
  display_name?: string | null;
  emoji?: string | null;
  kind?: ProfileKind;
  status?: ProfileStatus;
  model_default?: string | null;
  provider_default?: string | null;
  device?: string | null;
  last_onboarded?: string | null;
}

export function upsertProfile(db: Database, name: string, fields: ProfileFields): void {
  const existing = getProfile(db, name);
  if (existing === null) {
    db.run(
      `INSERT INTO profiles (name, display_name, emoji, kind, status, model_default, provider_default, device, last_onboarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        fields.display_name ?? null,
        fields.emoji ?? null,
        fields.kind ?? "permanent",
        fields.status ?? "active",
        fields.model_default ?? null,
        fields.provider_default ?? null,
        fields.device ?? null,
        fields.last_onboarded ?? null,
      ],
    );
    return;
  }
  db.run(
    `UPDATE profiles SET
       display_name = ?, emoji = ?, kind = ?, status = ?, model_default = ?, provider_default = ?, device = ?, last_onboarded = ?, updated_at = datetime('now')
     WHERE name = ?`,
    [
      fields.display_name ?? existing.display_name,
      fields.emoji ?? existing.emoji,
      fields.kind ?? existing.kind,
      fields.status ?? existing.status,
      fields.model_default ?? existing.model_default,
      fields.provider_default ?? existing.provider_default,
      fields.device ?? existing.device,
      fields.last_onboarded ?? existing.last_onboarded,
      name,
    ],
  );
}

export function getSoul(db: Database, profileName: string): SoulRow | null {
  return (
    (db.query("SELECT * FROM souls WHERE profile_name = ?").get(profileName) as SoulRow | null) ?? null
  );
}

export interface SoulFields {
  soul_md?: string | null;
  personality_tags?: string | null;
  tool_restrictions?: string | null;
  canon_ref?: string | null;
}

export function upsertSoul(db: Database, profileName: string, fields: SoulFields): void {
  const existing = getSoul(db, profileName);
  if (existing === null) {
    db.run(
      `INSERT INTO souls (profile_name, soul_md, personality_tags, tool_restrictions, canon_ref)
       VALUES (?, ?, ?, ?, ?)`,
      [
        profileName,
        fields.soul_md ?? null,
        fields.personality_tags ?? null,
        fields.tool_restrictions ?? null,
        fields.canon_ref ?? null,
      ],
    );
    return;
  }
  db.run(
    `UPDATE souls SET
       soul_md = ?, personality_tags = ?, tool_restrictions = ?, canon_ref = ?, version = version + 1, updated_at = datetime('now')
     WHERE profile_name = ?`,
    [
      fields.soul_md ?? existing.soul_md,
      fields.personality_tags ?? existing.personality_tags,
      fields.tool_restrictions ?? existing.tool_restrictions,
      fields.canon_ref ?? existing.canon_ref,
      profileName,
    ],
  );
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

export interface SystemCounts {
  agentsTotal: number;
  agentsOnline: number;
  keysActive: number;
  keysRevoked: number;
}

export function getSystemCounts(db: Database): SystemCounts {
  const count = (sql: string): number => {
    const row = db.query(sql).get();
    if (!row || typeof row !== "object" || !("count" in row)) {
      throw new Error(`expected count row from: ${sql}`);
    }
    return Number((row as { count: number }).count);
  };

  return {
    agentsTotal: count("SELECT COUNT(*) AS count FROM agents"),
    agentsOnline: count("SELECT COUNT(*) AS count FROM agents WHERE connected = 1"),
    keysActive: count("SELECT COUNT(*) AS count FROM agent_keys WHERE revoked_at IS NULL"),
    keysRevoked: count("SELECT COUNT(*) AS count FROM agent_keys WHERE revoked_at IS NOT NULL"),
  };
}
