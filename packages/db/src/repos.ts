import type { Database } from "bun:sqlite";
import type {
  AgentKind,
  AgentRow,
  AgentKeyRow,
  AgentEventRow,
  ConfigTemplateRow,
  DeviceRow,
  MemoryMirrorRow,
  MemoryTarget,
  ModelRouteRow,
  ProfileKind,
  ProfileRow,
  ProfileStatus,
  ProviderModelRow,
  ProviderRow,
  ProviderStatus,
  SessionRow,
  SkillRow,
  SoulRow,
  SyncDirection,
  TaskRow,
  TaskStatus,
  UsageLogRow,
  WireFormat,
} from "@cardinal/core";

export type {
  AgentKind,
  AgentRow,
  AgentKeyRow,
  AgentEventRow,
  ConfigTemplateRow,
  DeviceRow,
  MemoryMirrorRow,
  MemoryTarget,
  ModelRouteRow,
  ProfileKind,
  ProfileRow,
  ProfileStatus,
  ProviderModelRow,
  ProviderRow,
  ProviderStatus,
  SessionRow,
  SkillRow,
  SoulRow,
  SyncDirection,
  TaskRow,
  TaskStatus,
  UsageLogRow,
  WireFormat,
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

export function updateAgentDeviceInfo(db: Database, name: string, info: Record<string, unknown>): void {
  const device = typeof info.hostname === "string" && info.hostname.length > 0 ? info.hostname : undefined;
  const serialized = JSON.stringify(info);
  if (device !== undefined) {
    db.run(
      "UPDATE agents SET device = ?, device_info = ?, last_seen = datetime('now') WHERE name = ?",
      [device, serialized, name],
    );
  } else {
    db.run("UPDATE agents SET device_info = ?, last_seen = datetime('now') WHERE name = ?", [
      serialized,
      name,
    ]);
  }
}

export function listDevices(db: Database): DeviceRow[] {
  const rows = db
    .query(
      "SELECT name, device, device_info, last_seen FROM agents ORDER BY name",
    )
    .all() as Array<{
    name: string;
    device: string;
    device_info: string | null;
    last_seen: string | null;
  }>;

  const grouped = new Map<
    string,
    { info: Record<string, unknown>; profiles: string[]; lastSeen: string | null; count: number }
  >();

  for (const row of rows) {
    let info: Record<string, unknown> = {};
    let hasInfo = false;
    if (row.device_info !== null && row.device_info.length > 0) {
      try {
        info = JSON.parse(row.device_info) as Record<string, unknown>;
        hasInfo = true;
      } catch {
        info = {};
      }
    }
    const hostname = typeof info.hostname === "string" && info.hostname.length > 0 ? info.hostname : null;
    const id = hostname ?? row.device;

    const entry = grouped.get(id);
    if (entry === undefined) {
      grouped.set(id, { info, profiles: [row.name], lastSeen: row.last_seen, count: 1 });
    } else {
      if (hasInfo) entry.info = { ...entry.info, ...info };
      entry.profiles.push(row.name);
      entry.count += 1;
      if (
        row.last_seen !== null &&
        (entry.lastSeen === null || row.last_seen > entry.lastSeen)
      ) {
        entry.lastSeen = row.last_seen;
      }
    }
  }

  return [...grouped.entries()]
    .map(([id, entry]): DeviceRow => {
      const info = entry.info;
      return {
        id,
        hostname: typeof info.hostname === "string" ? info.hostname : null,
        platform: typeof info.platform === "string" ? info.platform : null,
        arch: typeof info.arch === "string" ? info.arch : null,
        gpu: typeof info.gpu === "string" ? info.gpu : null,
        ram_gb: typeof info.ram_gb === "number" ? info.ram_gb : null,
        ip: typeof info.ip === "string" ? info.ip : null,
        last_seen: entry.lastSeen,
        profiles: entry.profiles.sort(),
        agents: entry.count,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
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
        fields.display_name !== undefined ? fields.display_name : null,
        fields.emoji !== undefined ? fields.emoji : null,
        fields.kind !== undefined ? fields.kind : "permanent",
        fields.status !== undefined ? fields.status : "active",
        fields.model_default !== undefined ? fields.model_default : null,
        fields.provider_default !== undefined ? fields.provider_default : null,
        fields.device !== undefined ? fields.device : null,
        fields.last_onboarded !== undefined ? fields.last_onboarded : null,
      ],
    );
    return;
  }
  db.run(
    `UPDATE profiles SET
       display_name = ?, emoji = ?, kind = ?, status = ?, model_default = ?, provider_default = ?, device = ?, last_onboarded = ?, updated_at = datetime('now')
     WHERE name = ?`,
    [
      fields.display_name !== undefined ? fields.display_name : existing.display_name,
      fields.emoji !== undefined ? fields.emoji : existing.emoji,
      fields.kind !== undefined ? fields.kind : existing.kind,
      fields.status !== undefined ? fields.status : existing.status,
      fields.model_default !== undefined ? fields.model_default : existing.model_default,
      fields.provider_default !== undefined ? fields.provider_default : existing.provider_default,
      fields.device !== undefined ? fields.device : existing.device,
      fields.last_onboarded !== undefined ? fields.last_onboarded : existing.last_onboarded,
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
        fields.soul_md !== undefined ? fields.soul_md : null,
        fields.personality_tags !== undefined ? fields.personality_tags : null,
        fields.tool_restrictions !== undefined ? fields.tool_restrictions : null,
        fields.canon_ref !== undefined ? fields.canon_ref : null,
      ],
    );
    return;
  }
  db.run(
    `UPDATE souls SET
       soul_md = ?, personality_tags = ?, tool_restrictions = ?, canon_ref = ?, version = version + 1, updated_at = datetime('now')
     WHERE profile_name = ?`,
    [
      fields.soul_md !== undefined ? fields.soul_md : existing.soul_md,
      fields.personality_tags !== undefined ? fields.personality_tags : existing.personality_tags,
      fields.tool_restrictions !== undefined ? fields.tool_restrictions : existing.tool_restrictions,
      fields.canon_ref !== undefined ? fields.canon_ref : existing.canon_ref,
      profileName,
    ],
  );
}

export function getConfigTemplate(db: Database, profileName: string): ConfigTemplateRow | null {
  return (
    (db
      .query("SELECT * FROM config_templates WHERE profile_name = ?")
      .get(profileName) as ConfigTemplateRow | null) ?? null
  );
}

export interface ConfigFields {
  config_yaml?: string | null;
}

export function upsertConfigTemplate(db: Database, profileName: string, fields: ConfigFields): void {
  const existing = getConfigTemplate(db, profileName);
  if (existing === null) {
    db.run("INSERT INTO config_templates (profile_name, config_yaml) VALUES (?, ?)", [
      profileName,
      fields.config_yaml !== undefined ? fields.config_yaml : null,
    ]);
    return;
  }
  db.run(
    `UPDATE config_templates SET
       config_yaml = ?, version = version + 1, updated_at = datetime('now')
     WHERE profile_name = ?`,
    [fields.config_yaml !== undefined ? fields.config_yaml : existing.config_yaml, profileName],
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
  args: {
    keyHash: string;
    agentName: string;
    kindOverride?: AgentKind;
    createdBy?: "human" | "system";
    scopes?: string[];
    budgetLimit?: number;
  },
): void {
  db.run(
    "INSERT INTO agent_keys (key_hash, agent_name, kind_override, created_by, scopes, budget_limit) VALUES (?, ?, ?, ?, ?, ?)",
    [
      args.keyHash,
      args.agentName,
      args.kindOverride ?? null,
      args.createdBy ?? "human",
      JSON.stringify(args.scopes ?? ["*"]),
      args.budgetLimit ?? null,
    ],
  );
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

export function consumeBudget(db: Database, keyHash: string, tokens: number): boolean {
  const result = db
    .query(
      `UPDATE agent_keys
       SET budget_used = budget_used + ?, last_used_at = datetime('now')
       WHERE key_hash = ? AND revoked_at IS NULL
         AND (budget_limit IS NULL OR budget_used + ? <= budget_limit)`,
    )
    .run(tokens, keyHash, tokens);
  return result.changes > 0;
}

export function revokeKeysForAgent(db: Database, agentName: string): void {
  db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE agent_name = ? AND revoked_at IS NULL", [
    agentName,
  ]);
}

export function listKeys(db: Database): AgentKeyRow[] {
  return db.query("SELECT * FROM agent_keys ORDER BY id").all() as AgentKeyRow[];
}

export interface ProviderFields {
  name: string;
  baseUrl: string;
  apiKeyEnc?: string | null;
  wireFormat?: WireFormat;
  status?: ProviderStatus;
  rpmLimit?: number | null;
  tpmLimit?: number | null;
  costPerMtok?: number;
}

export function upsertProvider(db: Database, args: ProviderFields): void {
  db.run(
    `INSERT INTO providers (name, base_url, api_key_enc, wire_format, status, rpm_limit, tpm_limit, cost_per_mtok)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       base_url = excluded.base_url,
       api_key_enc = excluded.api_key_enc,
       wire_format = excluded.wire_format,
       status = excluded.status,
       rpm_limit = excluded.rpm_limit,
       tpm_limit = excluded.tpm_limit,
       cost_per_mtok = excluded.cost_per_mtok`,
    [
      args.name,
      args.baseUrl,
      args.apiKeyEnc ?? null,
      args.wireFormat ?? "openai",
      args.status ?? "active",
      args.rpmLimit ?? null,
      args.tpmLimit ?? null,
      args.costPerMtok ?? 0,
    ],
  );
}

export function listProviders(db: Database): ProviderRow[] {
  return db.query("SELECT * FROM providers ORDER BY name").all() as ProviderRow[];
}

export function getProviderByName(db: Database, name: string): ProviderRow | null {
  return (db.query("SELECT * FROM providers WHERE name = ?").get(name) as ProviderRow | null) ?? null;
}

export function setProviderStatus(db: Database, name: string, status: ProviderStatus): void {
  db.run("UPDATE providers SET status = ? WHERE name = ?", [status, name]);
}

export interface ProviderModelFields {
  providerId: number;
  modelId: string;
  capabilities?: string;
  contextWindow?: number | null;
}

export function addProviderModel(db: Database, args: ProviderModelFields): void {
  db.run(
    `INSERT INTO provider_models (provider_id, model_id, capabilities, context_window)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(provider_id, model_id) DO UPDATE SET
       capabilities = excluded.capabilities,
       context_window = excluded.context_window`,
    [
      args.providerId,
      args.modelId,
      args.capabilities ?? "[]",
      args.contextWindow ?? null,
    ],
  );
}

export function listProviderModels(db: Database, providerId: number): ProviderModelRow[] {
  return db
    .query("SELECT * FROM provider_models WHERE provider_id = ? ORDER BY model_id")
    .all(providerId) as ProviderModelRow[];
}

export interface ModelRouteHop {
  provider: string;
  model: string;
}

export function upsertModelRoute(db: Database, alias: string, fallbackChain: ModelRouteHop[]): void {
  db.run(
    `INSERT INTO model_routes (alias, fallback_chain)
     VALUES (?, ?)
     ON CONFLICT(alias) DO UPDATE SET fallback_chain = excluded.fallback_chain`,
    [alias, JSON.stringify(fallbackChain)],
  );
}

export function getModelRoute(db: Database, alias: string): ModelRouteRow | null {
  return (db.query("SELECT * FROM model_routes WHERE alias = ?").get(alias) as ModelRouteRow | null) ?? null;
}

export function listModelRoutes(db: Database): ModelRouteRow[] {
  return db.query("SELECT * FROM model_routes ORDER BY alias").all() as ModelRouteRow[];
}

export interface UsageLogFields {
  agentName: string;
  keyHash: string;
  providerId: number;
  providerName: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function logUsage(db: Database, args: UsageLogFields): void {
  db.run(
    `INSERT INTO usage_log (agent_name, key_hash, provider_id, provider_name, model_id, prompt_tokens, completion_tokens, total_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.agentName,
      args.keyHash,
      args.providerId,
      args.providerName,
      args.modelId,
      args.promptTokens,
      args.completionTokens,
      args.totalTokens,
    ],
  );
}

export function listUsage(db: Database, limit = 100): UsageLogRow[] {
  return db
    .query("SELECT * FROM usage_log ORDER BY id DESC LIMIT ?")
    .all(limit) as UsageLogRow[];
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

export function listSkills(db: Database): SkillRow[] {
  return db.query("SELECT * FROM skills ORDER BY name").all() as SkillRow[];
}

export function getSkill(db: Database, name: string): SkillRow | null {
  return (db.query("SELECT * FROM skills WHERE name = ?").get(name) as SkillRow | null) ?? null;
}

export interface SkillFields {
  description?: string | null;
  category?: string | null;
  content_hash?: string | null;
  path?: string | null;
  required_toolsets?: string | null;
}

export function upsertSkill(db: Database, name: string, fields: SkillFields): void {
  const existing = getSkill(db, name);
  if (existing === null) {
    db.run(
      `INSERT INTO skills (name, description, category, content_hash, path, required_toolsets)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        fields.description !== undefined ? fields.description : null,
        fields.category !== undefined ? fields.category : null,
        fields.content_hash !== undefined ? fields.content_hash : null,
        fields.path !== undefined ? fields.path : null,
        fields.required_toolsets !== undefined ? fields.required_toolsets : null,
      ],
    );
    return;
  }
  db.run(
    `UPDATE skills SET
       description = ?, category = ?, content_hash = ?, path = ?, required_toolsets = ?, updated_at = datetime('now')
     WHERE name = ?`,
    [
      fields.description !== undefined ? fields.description : existing.description,
      fields.category !== undefined ? fields.category : existing.category,
      fields.content_hash !== undefined ? fields.content_hash : existing.content_hash,
      fields.path !== undefined ? fields.path : existing.path,
      fields.required_toolsets !== undefined ? fields.required_toolsets : existing.required_toolsets,
      name,
    ],
  );
}

export interface ProfileSkill extends SkillRow {
  pinned: number;
}

export function listSkillsForProfile(db: Database, profileName: string): ProfileSkill[] {
  return db
    .query(
      `SELECT s.*, ps.pinned FROM skills s
       JOIN profile_skills ps ON ps.skill_name = s.name
       WHERE ps.profile_name = ?
       ORDER BY s.name`,
    )
    .all(profileName) as ProfileSkill[];
}

export function addSkillToProfile(
  db: Database,
  profileName: string,
  skillName: string,
  options: { pinned?: number } = {},
): void {
  db.run(
    `INSERT INTO profile_skills (profile_name, skill_name, pinned)
     VALUES (?, ?, ?)
     ON CONFLICT(profile_name, skill_name) DO UPDATE SET pinned = excluded.pinned`,
    [profileName, skillName, options.pinned ?? 0],
  );
}

export function getMemoryMirror(
  db: Database,
  profileName: string,
  target: MemoryTarget,
): MemoryMirrorRow | null {
  return (
    (db
      .query("SELECT * FROM memory_mirror WHERE profile_name = ? AND target = ?")
      .get(profileName, target) as MemoryMirrorRow | null) ?? null
  );
}

export interface MemoryMirrorFields {
  content?: string | null;
  content_hash?: string | null;
  sync_direction?: SyncDirection;
}

export function upsertMemoryMirror(
  db: Database,
  profileName: string,
  target: MemoryTarget,
  fields: MemoryMirrorFields,
): void {
  const existing = getMemoryMirror(db, profileName, target);
  if (existing === null) {
    const content = fields.content !== undefined ? fields.content : null;
    db.run(
      `INSERT INTO memory_mirror (profile_name, target, content, char_count, content_hash, sync_direction)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        profileName,
        target,
        content,
        content === null ? 0 : content.length,
        fields.content_hash !== undefined ? fields.content_hash : null,
        fields.sync_direction !== undefined ? fields.sync_direction : "local_primary",
      ],
    );
    return;
  }
  db.run(
    `UPDATE memory_mirror SET
       content = ?, char_count = ?, content_hash = ?, sync_direction = ?, last_synced = datetime('now')
     WHERE profile_name = ? AND target = ?`,
    [
      fields.content !== undefined ? fields.content : existing.content,
      fields.content !== undefined
        ? fields.content === null
          ? 0
          : fields.content.length
        : existing.char_count,
      fields.content_hash !== undefined ? fields.content_hash : existing.content_hash,
      fields.sync_direction !== undefined ? fields.sync_direction : existing.sync_direction,
      profileName,
      target,
    ],
  );
}

export function listSessions(db: Database): SessionRow[] {
  return db
    .query(
      `SELECT s.* FROM sessions_index s
       JOIN profiles p ON p.name = s.profile_name
       ORDER BY s.started_at DESC`,
    )
    .all() as SessionRow[];
}

export function getSession(db: Database, id: string): SessionRow | null {
  return (db.query("SELECT * FROM sessions_index WHERE id = ?").get(id) as SessionRow | null) ?? null;
}

export interface SessionFields {
  id: string;
  profile_name: string;
  title?: string | null;
  model?: string | null;
  started_at?: number | null;
  message_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost?: number;
}

export function upsertSession(db: Database, session: SessionFields): void {
  const existing = getSession(db, session.id);
  if (existing === null) {
    db.run(
      `INSERT INTO sessions_index (id, profile_name, title, model, started_at, message_count, input_tokens, output_tokens, estimated_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.profile_name,
        session.title ?? null,
        session.model ?? null,
        session.started_at ?? null,
        session.message_count ?? 0,
        session.input_tokens ?? 0,
        session.output_tokens ?? 0,
        session.estimated_cost ?? 0,
      ],
    );
    return;
  }
  db.run(
    `UPDATE sessions_index SET
       title = ?, model = ?, started_at = ?, message_count = ?, input_tokens = ?, output_tokens = ?, estimated_cost = ?
     WHERE id = ?`,
    [
      session.title !== undefined ? session.title : existing.title,
      session.model !== undefined ? session.model : existing.model,
      session.started_at !== undefined ? session.started_at : existing.started_at,
      session.message_count !== undefined ? session.message_count : existing.message_count,
      session.input_tokens !== undefined ? session.input_tokens : existing.input_tokens,
      session.output_tokens !== undefined ? session.output_tokens : existing.output_tokens,
      session.estimated_cost !== undefined ? session.estimated_cost : existing.estimated_cost,
      session.id,
    ],
  );
}

export function getTask(db: Database, id: string): TaskRow | null {
  return (db.query("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | null) ?? null;
}

export function createTask(
  db: Database,
  args: { goal: string; createdBy: string; parentId?: string | null },
): TaskRow {
  const id = crypto.randomUUID();
  db.run("INSERT INTO tasks (id, goal, created_by, parent_id) VALUES (?, ?, ?, ?)", [
    id,
    args.goal,
    args.createdBy,
    args.parentId ?? null,
  ]);
  return getTask(db, id)!;
}

export function listTasks(db: Database, status?: TaskStatus): TaskRow[] {
  if (status !== undefined) {
    return db.query("SELECT * FROM tasks WHERE status = ? ORDER BY created_at").all(status) as TaskRow[];
  }
  return db.query("SELECT * FROM tasks ORDER BY created_at").all() as TaskRow[];
}

export function claimTask(db: Database, id: string, by: string): TaskRow | null {
  const result = db
    .query(
      "UPDATE tasks SET status = 'claimed', assigned_to = ?, updated_at = datetime('now') WHERE id = ? AND status = 'open'",
    )
    .run(by, id);
  if (result.changes === 0) return null;
  return getTask(db, id);
}

export function completeTask(
  db: Database,
  id: string,
  args: { summary?: string | null; artifactRef?: string | null },
): TaskRow | null {
  if (getTask(db, id) === null) return null;
  db.run(
    "UPDATE tasks SET status = 'done', summary = ?, artifact_ref = ?, updated_at = datetime('now') WHERE id = ?",
    [args.summary ?? null, args.artifactRef ?? null, id],
  );
  return getTask(db, id);
}
