import { describe, expect, test } from "bun:test";
import { createDb, migrate } from "./schema";
import {
  addProviderModel,
  addSkillToProfile,
  consumeBudget,
  consumeBudgetUsd,
  createAgentKey,
  findActiveKeyByHash,
  getKeyById,
  listHumanKeys,
  revokeKeyById,
  getAgent,
  getConfigTemplate,
  getMemoryMirror,
  getModelRoute,
  getProfile,
  getProviderByName,
  getSession,
  getSkill,
  getSoul,
  getSystemCounts,
  insertEvent,
  listAgents,
  listDevices,
  listEvents,
  listKeys,
  listModelRoutes,
  listProfiles,
  listProviderModels,
  listProviders,
  listSessions,
  listSkills,
  listSkillsForProfile,
  listUsage,
  logUsage,
  markAgentDisconnected,
  registerAgent,
  revokeKeysForAgent,
  setProviderStatus,
  touchKey,
  updateAgentDeviceInfo,
  updateAgentStatus,
  upsertAgentOnConnect,
  upsertConfigTemplate,
  upsertMemoryMirror,
  upsertModelRoute,
  upsertProfile,
  upsertProvider,
  upsertSession,
  upsertSkill,
  upsertSoul,
} from "./repos";

function tableNames(db: ReturnType<typeof createDb>): string[] {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe("migrations", () => {
  test("migrate creates the 17 tables and sets user_version to 14", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toEqual([
      "agent_events",
      "agent_keys",
      "agents",
      "config_templates",
      "memory_mirror",
      "messages",
      "model_routes",
      "profile_skills",
      "profiles",
      "provider_models",
      "providers",
      "rag_cache",
      "sessions_index",
      "skills",
      "souls",
      "tasks",
      "usage_log",
    ]);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(14);
    db.close();
  });

  test("createDb + migrate are idempotent", () => {
    const db = createDb(":memory:");
    migrate(db);
    migrate(db);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(14);
    expect(tableNames(db)).toHaveLength(17);
    db.close();
  });

  test("migration 8 adds the device_info TEXT column to agents", () => {
    const db = createDb(":memory:");
    const cols = db.query("PRAGMA table_info(agents)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("device_info");
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(14);
    db.close();
  });

  test("migration 10 creates providers/provider_models/model_routes and extends agent_keys", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("providers");
    expect(tableNames(db)).toContain("provider_models");
    expect(tableNames(db)).toContain("model_routes");

    const cols = db.query("PRAGMA table_info(agent_keys)").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("scopes");
    expect(names).toContain("budget_limit");
    expect(names).toContain("budget_used");

    db.query(
      "INSERT INTO providers (name, base_url, wire_format, cost_per_mtok) VALUES (?, ?, ?, ?)",
    ).run("opencode-go", "http://localhost:4343/v1", "openai", 0.5);

    const p = db.query("SELECT * FROM providers WHERE name = ?").get("opencode-go") as Record<string, unknown>;
    expect(p!.wire_format).toBe("openai");
    expect(p!.status).toBe("active");
    expect(p!.api_key_enc).toBeNull();
    expect(p!.cost_per_mtok).toBe(0.5);

    expect(() =>
      db.query("INSERT INTO providers (name, base_url, wire_format) VALUES (?, ?, ?)").run("bad", "http://x", "cohere"),
    ).toThrow();
    expect(() =>
      db.query("INSERT INTO providers (name, base_url, status) VALUES (?, ?, ?)").run("bad2", "http://x", "zombie"),
    ).toThrow();

    db.query("INSERT INTO model_routes (alias) VALUES (?)").run("pro");
    const r = db.query("SELECT * FROM model_routes WHERE alias = ?").get("pro") as Record<string, unknown>;
    expect(r!.fallback_chain).toBe("[]");

    db.close();
  });

  test("migration 14 adds expires_at / budget_usd_limit / budget_usd_used to agent_keys", () => {
    const db = createDb(":memory:");
    const cols = db.query("PRAGMA table_info(agent_keys)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("expires_at");
    expect(names).toContain("budget_usd_limit");
    expect(names).toContain("budget_usd_used");

    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.expires_at.type).toBe("TEXT");
    expect(byName.expires_at.notnull).toBe(0);
    expect(byName.budget_usd_limit.type).toBe("REAL");
    expect(byName.budget_usd_limit.notnull).toBe(0);
    expect(byName.budget_usd_used.type).toBe("REAL");
    expect(byName.budget_usd_used.notnull).toBe(1);
    expect(byName.budget_usd_used.dflt_value).toBe("0");

    db.query("INSERT INTO agents (name) VALUES (?)").run("shinon");
    db.query("INSERT INTO agent_keys (key_hash, agent_name) VALUES (?, ?)").run("hash-m14", "shinon");
    const row = db.query("SELECT expires_at, budget_usd_limit, budget_usd_used FROM agent_keys WHERE key_hash = ?").get(
      "hash-m14",
    ) as { expires_at: string | null; budget_usd_limit: number | null; budget_usd_used: number };
    expect(row.expires_at).toBeNull();
    expect(row.budget_usd_limit).toBeNull();
    expect(row.budget_usd_used).toBe(0);

    const version = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(version.user_version).toBe(14);
    db.close();
  });

  test("migration 11 creates usage_log with token columns and created_at default", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("usage_log");

    const cols = db.query("PRAGMA table_info(usage_log)").all() as Array<{ name: string; notnull: number }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual([
      "id",
      "agent_name",
      "key_hash",
      "provider_id",
      "provider_name",
      "model_id",
      "prompt_tokens",
      "completion_tokens",
      "total_tokens",
      "created_at",
    ]);

    db.query(
      "INSERT INTO usage_log (agent_name, key_hash, provider_id, provider_name, model_id) VALUES (?, ?, ?, ?, ?)",
    ).run("shinon", "hash-1", 1, "mock-a", "test-model");

    const row = db.query("SELECT * FROM usage_log WHERE key_hash = ?").get("hash-1") as Record<string, unknown>;
    expect(row.prompt_tokens).toBe(0);
    expect(row.completion_tokens).toBe(0);
    expect(row.total_tokens).toBe(0);
    expect(typeof row.created_at).toBe("string");
    expect(row.created_at).not.toBe("");

    db.close();
  });

  test("migration 12 creates the messages table with columns, DEFAULT read=0 and created_at", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("messages");

    const cols = db.query("PRAGMA table_info(messages)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual([
      "id",
      "from_agent",
      "to_agent",
      "type",
      "payload_ref",
      "read",
      "created_at",
    ]);

    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.id.pk).toBe(1);
    expect(byName.from_agent.notnull).toBe(1);
    expect(byName.to_agent.notnull).toBe(1);
    expect(byName.type.notnull).toBe(1);
    expect(byName.payload_ref.notnull).toBe(0);
    expect(byName.read.notnull).toBe(1);
    expect(byName.read.dflt_value).toBe("0");
    expect(byName.created_at.notnull).toBe(1);
    expect(typeof byName.created_at.dflt_value).toBe("string");
    expect(byName.created_at.dflt_value).toContain("datetime");

    db.query("INSERT INTO messages (id, from_agent, to_agent, type) VALUES (?, ?, ?, ?)").run(
      "m1",
      "shinon",
      "kirito",
      "handoff",
    );
    const row = db.query("SELECT * FROM messages WHERE id = ?").get("m1") as Record<string, unknown>;
    expect(row.read).toBe(0);
    expect(row.payload_ref).toBeNull();
    expect(typeof row.created_at).toBe("string");
    expect(row.created_at).not.toBe("");

    db.query("INSERT INTO messages (id, from_agent, to_agent, type) VALUES (?, ?, ?, ?)").run(
      "m-ghost",
      "ghost-from",
      "ghost-to",
      "custom-type",
    );

    expect(() =>
      db.query("INSERT INTO messages (id, to_agent, type) VALUES (?, ?, ?)").run("m2", "kirito", "handoff"),
    ).toThrow();
    expect(() =>
      db.query("INSERT INTO messages (id, from_agent, type) VALUES (?, ?, ?)").run("m3", "shinon", "handoff"),
    ).toThrow();
    expect(() =>
      db.query("INSERT INTO messages (id, from_agent, to_agent) VALUES (?, ?, ?)").run("m4", "shinon", "kirito"),
    ).toThrow();

    db.close();
  });

  test("migration 7 creates the config_templates table with FK to profiles, version default and no updated_at", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("config_templates");

    db.query("INSERT INTO profiles (name) VALUES (?)").run("hermes");

    db.query(
      "INSERT INTO config_templates (profile_name, config_yaml) VALUES (?, ?)",
    ).run("hermes", "model:\n  default: gpt-4o\n");

    const c = db
      .query("SELECT * FROM config_templates WHERE profile_name = ?")
      .get("hermes") as Record<string, unknown>;
    expect(c).not.toBeNull();
    expect(c!.profile_name).toBe("hermes");
    expect(c!.config_yaml).toBe("model:\n  default: gpt-4o\n");
    expect(c!.version).toBe(1);
    expect(c!.updated_at).toBeNull();

    expect(() => db.query("INSERT INTO config_templates (profile_name) VALUES (?)").run("ghost")).toThrow();
    db.close();
  });

  test("migration 6 creates the rag_cache table with defaults and PK on cache_key", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("rag_cache");

    db.query(
      "INSERT INTO rag_cache (cache_key, query, top_k, results) VALUES (?, ?, ?, ?)",
    ).run("key-1", "kirito", 5, "[]");

    const r = db
      .query("SELECT * FROM rag_cache WHERE cache_key = ?")
      .get("key-1") as Record<string, unknown>;
    expect(r).not.toBeNull();
    expect(r!.query).toBe("kirito");
    expect(r!.top_k).toBe(5);
    expect(r!.results).toBe("[]");
    expect(r!.created_at).not.toBeNull();

    expect(() =>
      db.query("INSERT INTO rag_cache (cache_key, query) VALUES (?, ?)").run("key-1", "dup"),
    ).toThrow();
    db.close();
  });

  test("migration 1 creates the profiles table with columns and CHECK constraints", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("profiles");

    db.query(
      "INSERT INTO profiles (name, display_name, emoji, model_default, provider_default, device, last_onboarded) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("hermes", "Hermes", "🧙", "gpt-4o", "openai", "laptop", "2026-08-01");

    const p = db
      .query("SELECT * FROM profiles WHERE name = ?")
      .get("hermes") as Record<string, unknown>;
    expect(p).not.toBeNull();
    expect(p!.display_name).toBe("Hermes");
    expect(p!.emoji).toBe("🧙");
    expect(p!.kind).toBe("permanent");
    expect(p!.status).toBe("active");
    expect(p!.model_default).toBe("gpt-4o");
    expect(p!.provider_default).toBe("openai");
    expect(p!.device).toBe("laptop");
    expect(p!.last_onboarded).toBe("2026-08-01");
    expect(p!.created_at).not.toBeNull();
    expect(p!.updated_at).toBeNull();

    expect(() =>
      db.query("INSERT INTO profiles (name, kind) VALUES (?, ?)").run("bad-kind", "ghost"),
    ).toThrow();
    expect(() =>
      db.query("INSERT INTO profiles (name, status) VALUES (?, ?)").run("bad-status", "zombie"),
    ).toThrow();
    db.close();
  });

  test("migration 2 creates the souls table with FK to profiles and version default", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("souls");

    db.query("INSERT INTO profiles (name) VALUES (?)").run("hermes");

    db.query("INSERT INTO souls (profile_name, soul_md, personality_tags) VALUES (?, ?, ?)").run(
      "hermes",
      "# alma",
      "curioso, leal",
    );

    const s = db.query("SELECT * FROM souls WHERE profile_name = ?").get("hermes") as Record<string, unknown>;
    expect(s).not.toBeNull();
    expect(s!.soul_md).toBe("# alma");
    expect(s!.personality_tags).toBe("curioso, leal");
    expect(s!.tool_restrictions).toBeNull();
    expect(s!.canon_ref).toBeNull();
    expect(s!.version).toBe(1);
    expect(s!.updated_at).toBeNull();

    expect(() => db.query("INSERT INTO souls (profile_name) VALUES (?)").run("ghost")).toThrow();
    db.close();
  });

  test("migration 3 creates skills + profile_skills with FKs and pinned default", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("skills");
    expect(tableNames(db)).toContain("profile_skills");

    db.query(
      "INSERT INTO skills (name, description, category, content_hash, path, required_toolsets) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("git", "git workflows", "dev", "abc123", "skills/git.md", "shell");

    const s = db.query("SELECT * FROM skills WHERE name = ?").get("git") as Record<string, unknown>;
    expect(s).not.toBeNull();
    expect(s!.description).toBe("git workflows");
    expect(s!.category).toBe("dev");
    expect(s!.content_hash).toBe("abc123");
    expect(s!.path).toBe("skills/git.md");
    expect(s!.required_toolsets).toBe("shell");
    expect(s!.updated_at).toBeNull();

    db.query("INSERT INTO profiles (name) VALUES (?)").run("hermes");
    db.query("INSERT INTO profile_skills (profile_name, skill_name) VALUES (?, ?)").run("hermes", "git");
    const ps = db
      .query("SELECT * FROM profile_skills WHERE profile_name = ? AND skill_name = ?")
      .get("hermes", "git") as Record<string, unknown>;
    expect(ps).not.toBeNull();
    expect(ps!.pinned).toBe(0);
    expect(ps!.added_at).toBeNull();

    expect(() => db.query("INSERT INTO profile_skills (profile_name, skill_name) VALUES (?, ?)").run("ghost", "git")).toThrow();
    expect(() => db.query("INSERT INTO profile_skills (profile_name, skill_name) VALUES (?, ?)").run("hermes", "ghost")).toThrow();
    db.close();
  });

  test("migration 4 creates the memory_mirror table with FKs, CHECKs and defaults", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("memory_mirror");

    db.query("INSERT INTO profiles (name) VALUES (?)").run("hermes");

    db.query(
      "INSERT INTO memory_mirror (profile_name, target, content, content_hash) VALUES (?, ?, ?, ?)",
    ).run("hermes", "memory", "hola mundo", "hash-1");

    const m = db
      .query("SELECT * FROM memory_mirror WHERE profile_name = ? AND target = ?")
      .get("hermes", "memory") as Record<string, unknown>;
    expect(m).not.toBeNull();
    expect(m!.content).toBe("hola mundo");
    expect(m!.char_count).toBe(0);
    expect(m!.content_hash).toBe("hash-1");
    expect(m!.last_synced).toBeNull();
    expect(m!.sync_direction).toBe("local_primary");

    expect(() =>
      db.query("INSERT INTO memory_mirror (profile_name, target) VALUES (?, ?)").run("ghost", "memory"),
    ).toThrow();
    expect(() =>
      db.query("INSERT INTO memory_mirror (profile_name, target) VALUES (?, ?)").run("hermes", "ghost"),
    ).toThrow();
    expect(() =>
      db
        .query("INSERT INTO memory_mirror (profile_name, target, sync_direction) VALUES (?, ?, ?)")
        .run("hermes", "memory", "nope"),
    ).toThrow();
    db.close();
  });

  test("migration 5 creates the sessions_index table with FK, defaults and REAL started_at", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toContain("sessions_index");

    db.query("INSERT INTO profiles (name) VALUES (?)").run("hermes");

    db.query(
      "INSERT INTO sessions_index (id, profile_name, title, model, started_at, message_count, input_tokens, output_tokens, estimated_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("s1", "hermes", "Hola", "gpt-4o", 1700000000.5, 5, 100, 50, 0.02);

    const s = db
      .query("SELECT * FROM sessions_index WHERE id = ?")
      .get("s1") as Record<string, unknown>;
    expect(s).not.toBeNull();
    expect(s!.profile_name).toBe("hermes");
    expect(s!.title).toBe("Hola");
    expect(s!.model).toBe("gpt-4o");
    expect(s!.started_at).toBe(1700000000.5);
    expect(s!.message_count).toBe(5);
    expect(s!.input_tokens).toBe(100);
    expect(s!.output_tokens).toBe(50);
    expect(s!.estimated_cost).toBe(0.02);

    db.query("INSERT INTO sessions_index (id, profile_name) VALUES (?, ?)").run("s2", "hermes");
    const s2 = db
      .query("SELECT * FROM sessions_index WHERE id = ?")
      .get("s2") as Record<string, unknown>;
    expect(s2!.title).toBeNull();
    expect(s2!.model).toBeNull();
    expect(s2!.started_at).toBeNull();
    expect(s2!.message_count).toBe(0);
    expect(s2!.input_tokens).toBe(0);
    expect(s2!.output_tokens).toBe(0);
    expect(s2!.estimated_cost).toBe(0);

    expect(() =>
      db.query("INSERT INTO sessions_index (id, profile_name) VALUES (?, ?)").run("s3", "ghost"),
    ).toThrow();
    db.close();
  });
});

describe("agents repo", () => {
  test("registerAgent inserts once and starts disconnected", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "shinon", "agent");
    const agents = listAgents(db);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("shinon");
    expect(agents[0].kind).toBe("agent");
    expect(agents[0].connected).toBe(0);
    db.close();
  });

  test("upsertAgentOnConnect inserts a new agent as connected", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "laptop", kind: "agent", status: "idle" });
    const agent = getAgent(db, "kirito");
    expect(agent).not.toBeNull();
    expect(agent!.connected).toBe(1);
    expect(agent!.device).toBe("laptop");
    expect(agent!.status).toBe("idle");
    expect(agent!.last_seen).not.toBeNull();
    db.close();
  });

  test("upsertAgentOnConnect updates an existing agent and reconnects it", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "laptop", kind: "agent", status: "idle" });
    markAgentDisconnected(db, "kirito");
    expect(getAgent(db, "kirito")!.connected).toBe(0);
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "busy" });
    expect(listAgents(db)).toHaveLength(1);
    const agent = getAgent(db, "kirito");
    expect(agent!.connected).toBe(1);
    expect(agent!.device).toBe("pc");
    expect(agent!.status).toBe("busy");
    db.close();
  });

  test("updateAgentStatus changes status and refreshes last_seen", () => {
    const db = createDb(":memory:");
    registerAgent(db, "asuna", "agent");
    updateAgentStatus(db, "asuna", "busy");
    const agent = getAgent(db, "asuna");
    expect(agent!.status).toBe("busy");
    expect(agent!.last_seen).not.toBeNull();
    db.close();
  });

  test("markAgentDisconnected sets connected to 0", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "eugeo", device: "pc", kind: "agent", status: "idle" });
    markAgentDisconnected(db, "eugeo");
    expect(getAgent(db, "eugeo")!.connected).toBe(0);
    db.close();
  });

  test("listAgents is ordered by name and getAgent returns null for unknown", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "asuna", "agent");
    registerAgent(db, "kirito", "subagent");
    expect(listAgents(db).map((a) => a.name)).toEqual(["asuna", "kirito", "shinon"]);
    expect(getAgent(db, "nobody")).toBeNull();
    db.close();
  });
});

describe("device registry repo", () => {
  test("updateAgentDeviceInfo stores JSON in device_info and bumps last_seen", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });
    updateAgentDeviceInfo(db, "shinon", {
      hostname: "home-pc",
      platform: "linux",
      arch: "x86_64",
      gpu: "RTX 4090",
      ram_gb: 64,
      ip: "192.168.1.5",
    });
    const agent = getAgent(db, "shinon");
    expect(agent!.device_info).not.toBeNull();
    const info = JSON.parse(agent!.device_info!) as Record<string, unknown>;
    expect(info).toMatchObject({
      hostname: "home-pc",
      platform: "linux",
      arch: "x86_64",
      gpu: "RTX 4090",
      ram_gb: 64,
      ip: "192.168.1.5",
    });
    expect(agent!.last_seen).not.toBeNull();
    db.close();
  });

  test("updateAgentDeviceInfo sets agents.device from info.hostname", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });
    updateAgentDeviceInfo(db, "shinon", { hostname: "laptop-sao" });
    expect(getAgent(db, "shinon")!.device).toBe("laptop-sao");
    db.close();
  });

  test("listDevices returns empty on empty db", () => {
    const db = createDb(":memory:");
    expect(listDevices(db)).toEqual([]);
    db.close();
  });

  test("listDevices groups agents by hostname with count, last_seen and profiles", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "idle" });
    upsertAgentOnConnect(db, { name: "asuna", device: "pc", kind: "agent", status: "idle" });
    upsertAgentOnConnect(db, { name: "lisbeth", device: "laptop", kind: "agent", status: "idle" });
    updateAgentDeviceInfo(db, "kirito", {
      hostname: "home-pc",
      platform: "linux",
      arch: "x86_64",
      gpu: "RTX",
      ram_gb: 32,
      ip: "10.0.0.2",
    });
    updateAgentDeviceInfo(db, "asuna", { hostname: "home-pc" });
    updateAgentDeviceInfo(db, "lisbeth", { hostname: "macbook", platform: "macos", arch: "arm64", ram_gb: 16 });

    const devices = listDevices(db);
    expect(devices).toHaveLength(2);
    const homePc = devices.find((d) => d.id === "home-pc")!;
    expect(homePc).toMatchObject({
      id: "home-pc",
      hostname: "home-pc",
      platform: "linux",
      arch: "x86_64",
      gpu: "RTX",
      ram_gb: 32,
      ip: "10.0.0.2",
    });
    expect(homePc.agents).toBe(2);
    expect(homePc.profiles.sort()).toEqual(["asuna", "kirito"]);
    const macbook = devices.find((d) => d.id === "macbook")!;
    expect(macbook).toMatchObject({ platform: "macos", arch: "arm64", ram_gb: 16 });
    expect(macbook.agents).toBe(1);
    expect(macbook.profiles).toEqual(["lisbeth"]);
    db.close();
  });

  test("listDevices treats corrupt device_info as empty and keeps the agent device", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "workstation", kind: "agent", status: "idle" });
    db.run("UPDATE agents SET device_info = ? WHERE name = ?", ["{not-json", "kirito"]);
    const devices = listDevices(db);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      id: "workstation",
      hostname: null,
      platform: null,
      arch: null,
      gpu: null,
      ram_gb: null,
      ip: null,
      agents: 1,
      profiles: ["kirito"],
    });
    db.close();
  });

  test("empty hostname does not rename the device and non-numeric fields stay null", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "pc", kind: "agent", status: "idle" });
    updateAgentDeviceInfo(db, "kirito", {
      hostname: "",
      platform: "linux",
      ram_gb: "64",
      gpu: false,
    });
    expect(getAgent(db, "kirito")!.device).toBe("pc");
    const devices = listDevices(db);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      id: "pc",
      hostname: "",
      platform: "linux",
      ram_gb: null,
      gpu: null,
    });
    db.close();
  });

  test("listDevices falls back to agents.device when device_info has no hostname", () => {
    const db = createDb(":memory:");
    upsertAgentOnConnect(db, { name: "kirito", device: "workstation", kind: "agent", status: "idle" });
    upsertAgentOnConnect(db, { name: "asuna", device: "workstation", kind: "agent", status: "idle" });
    updateAgentDeviceInfo(db, "kirito", { platform: "linux" });
    const devices = listDevices(db);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ id: "workstation", platform: "linux" });
    expect(devices[0].agents).toBe(2);
    expect(devices[0].profiles.sort()).toEqual(["asuna", "kirito"]);
    db.close();
  });
});

describe("profiles repo", () => {
  test("listProfiles returns empty on empty db and all profiles ordered by name", () => {
    const db = createDb(":memory:");
    expect(listProfiles(db)).toEqual([]);
    upsertProfile(db, "shinon", { display_name: "Shinon" });
    upsertProfile(db, "kirito", {});
    expect(listProfiles(db).map((p) => p.name)).toEqual(["kirito", "shinon"]);
    db.close();
  });

  test("upsertProfile inserts with defaults kind=permanent, status=active and created_at", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", { display_name: "Hermes", emoji: "🧙", device: "laptop" });
    const p = getProfile(db, "hermes");
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("permanent");
    expect(p!.status).toBe("active");
    expect(p!.display_name).toBe("Hermes");
    expect(p!.emoji).toBe("🧙");
    expect(p!.device).toBe("laptop");
    expect(p!.created_at).not.toBeNull();
    expect(p!.updated_at).toBeNull();
    db.close();
  });

  test("upsertProfile updates existing fields, sets updated_at and preserves unset ones", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", { display_name: "Hermes", device: "laptop" });
    upsertProfile(db, "hermes", { status: "dormant" });
    const p = getProfile(db, "hermes");
    expect(listProfiles(db)).toHaveLength(1);
    expect(p!.status).toBe("dormant");
    expect(p!.display_name).toBe("Hermes");
    expect(p!.device).toBe("laptop");
    expect(p!.updated_at).not.toBeNull();
    db.close();
  });

  test("upsertProfile clears a field when explicitly set to null", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", { display_name: "Hermes", emoji: "🧙", device: "laptop" });
    upsertProfile(db, "hermes", { emoji: null });
    const p = getProfile(db, "hermes");
    expect(p!.emoji).toBeNull();
    expect(p!.display_name).toBe("Hermes"); // campo no enviado se preserva
    expect(p!.device).toBe("laptop");
    db.close();
  });

  test("getProfile returns null for unknown names", () => {
    const db = createDb(":memory:");
    expect(getProfile(db, "nobody")).toBeNull();
    db.close();
  });
});

describe("skills repo", () => {
  test("listSkills returns empty on empty db and all skills ordered by name", () => {
    const db = createDb(":memory:");
    expect(listSkills(db)).toEqual([]);
    upsertSkill(db, "bash", { description: "shell scripting" });
    upsertSkill(db, "git", { description: "git workflows" });
    expect(listSkills(db).map((s) => s.name)).toEqual(["bash", "git"]);
    db.close();
  });

  test("upsertSkill inserts with all fields and no updated_at", () => {
    const db = createDb(":memory:");
    upsertSkill(db, "git", {
      description: "git workflows",
      category: "dev",
      content_hash: "abc123",
      path: "skills/git.md",
      required_toolsets: "shell",
    });
    const s = getSkill(db, "git");
    expect(s).not.toBeNull();
    expect(s!.name).toBe("git");
    expect(s!.description).toBe("git workflows");
    expect(s!.category).toBe("dev");
    expect(s!.content_hash).toBe("abc123");
    expect(s!.path).toBe("skills/git.md");
    expect(s!.required_toolsets).toBe("shell");
    expect(s!.updated_at).toBeNull();
    db.close();
  });

  test("upsertSkill updates existing fields, sets updated_at and preserves unset ones", () => {
    const db = createDb(":memory:");
    upsertSkill(db, "git", { description: "git workflows", path: "skills/git.md" });
    upsertSkill(db, "git", { content_hash: "def456" });
    expect(listSkills(db)).toHaveLength(1);
    const s = getSkill(db, "git");
    expect(s!.description).toBe("git workflows");
    expect(s!.path).toBe("skills/git.md");
    expect(s!.content_hash).toBe("def456");
    expect(s!.updated_at).not.toBeNull();
    db.close();
  });

  test("getSkill returns null for unknown names", () => {
    const db = createDb(":memory:");
    expect(getSkill(db, "nobody")).toBeNull();
    db.close();
  });

  test("addSkillToProfile inserts with pinned default 0 and added_at", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSkill(db, "git", { description: "git workflows" });
    addSkillToProfile(db, "hermes", "git", {});
    const rows = listSkillsForProfile(db, "hermes");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "git", pinned: 0 });
    db.close();
  });

  test("addSkillToProfile is idempotent and updates pinned", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSkill(db, "git", { description: "git workflows" });
    addSkillToProfile(db, "hermes", "git", {});
    addSkillToProfile(db, "hermes", "git", { pinned: 1 });
    expect(selectCount(db, "SELECT COUNT(*) AS count FROM profile_skills")).toBe(1);
    const rows = listSkillsForProfile(db, "hermes");
    expect(rows[0].pinned).toBe(1);
    db.close();
  });

  test("addSkillToProfile throws on unknown profile or skill", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSkill(db, "git", { description: "git workflows" });
    expect(() => addSkillToProfile(db, "ghost", "git", {})).toThrow();
    expect(() => addSkillToProfile(db, "hermes", "ghost", {})).toThrow();
    db.close();
  });

  test("listSkillsForProfile returns empty for profiles without skills and orders by name", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertProfile(db, "shinon", {});
    upsertSkill(db, "git", { description: "git workflows" });
    upsertSkill(db, "bash", { description: "shell scripting" });
    expect(listSkillsForProfile(db, "hermes")).toEqual([]);
    addSkillToProfile(db, "hermes", "git", {});
    addSkillToProfile(db, "hermes", "bash", {});
    expect(listSkillsForProfile(db, "hermes").map((s) => s.name)).toEqual(["bash", "git"]);
    expect(listSkillsForProfile(db, "shinon")).toEqual([]);
    db.close();
  });
});

describe("souls repo", () => {
  test("getSoul returns null for missing souls", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    expect(getSoul(db, "hermes")).toBeNull();
    expect(getSoul(db, "nobody")).toBeNull();
    db.close();
  });

  test("upsertSoul inserts with version=1 and no updated_at", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSoul(db, "hermes", { soul_md: "# alma", personality_tags: "curioso, leal" });
    const s = getSoul(db, "hermes");
    expect(s).not.toBeNull();
    expect(s!.profile_name).toBe("hermes");
    expect(s!.soul_md).toBe("# alma");
    expect(s!.personality_tags).toBe("curioso, leal");
    expect(s!.tool_restrictions).toBeNull();
    expect(s!.canon_ref).toBeNull();
    expect(s!.version).toBe(1);
    expect(s!.updated_at).toBeNull();
    db.close();
  });

  test("upsertSoul updates existing row, increments version and sets updated_at", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSoul(db, "hermes", { soul_md: "# alma", personality_tags: "curioso" });
    upsertSoul(db, "hermes", { canon_ref: "sao" });
    expect(getSoul(db, "hermes")!.version).toBe(2);
    const s = getSoul(db, "hermes");
    expect(s!.soul_md).toBe("# alma");
    expect(s!.personality_tags).toBe("curioso");
    expect(s!.canon_ref).toBe("sao");
    expect(s!.version).toBe(2);
    expect(s!.updated_at).not.toBeNull();
    expect(selectCount(db, "SELECT COUNT(*) AS count FROM souls")).toBe(1);
    db.close();
  });
});

function selectCount(db: ReturnType<typeof createDb>, sql: string): number {
  const row = db.query(sql).get() as { count: number };
  return Number(row.count);
}

describe("config_templates repo", () => {
  test("getConfigTemplate returns null for missing templates", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    expect(getConfigTemplate(db, "hermes")).toBeNull();
    expect(getConfigTemplate(db, "nobody")).toBeNull();
    db.close();
  });

  test("upsertConfigTemplate inserts with version=1 and no updated_at", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertConfigTemplate(db, "hermes", { config_yaml: "model:\n  default: gpt-4o\n" });
    const c = getConfigTemplate(db, "hermes");
    expect(c).not.toBeNull();
    expect(c!.profile_name).toBe("hermes");
    expect(c!.config_yaml).toBe("model:\n  default: gpt-4o\n");
    expect(c!.version).toBe(1);
    expect(c!.updated_at).toBeNull();
    db.close();
  });

  test("upsertConfigTemplate updates existing row, increments version and sets updated_at", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertConfigTemplate(db, "hermes", { config_yaml: "model:\n  default: gpt-4o\n" });
    upsertConfigTemplate(db, "hermes", { config_yaml: "model:\n  default: gpt-4o-mini\n" });
    expect(selectCount(db, "SELECT COUNT(*) AS count FROM config_templates")).toBe(1);
    const c = getConfigTemplate(db, "hermes");
    expect(c!.config_yaml).toBe("model:\n  default: gpt-4o-mini\n");
    expect(c!.version).toBe(2);
    expect(c!.updated_at).not.toBeNull();
    db.close();
  });

  test("upsertConfigTemplate throws on unknown profile (FK)", () => {
    const db = createDb(":memory:");
    expect(() => upsertConfigTemplate(db, "ghost", { config_yaml: "x" })).toThrow();
    db.close();
  });
});

describe("events repo", () => {
  test("insertEvent + listEvents returns newest first and respects limit", () => {
    const db = createDb(":memory:");
    insertEvent(db, { agentName: "shinon", type: "connect", meta: "pc" });
    insertEvent(db, { agentName: "shinon", type: "status", meta: "busy" });
    insertEvent(db, { agentName: "shinon", type: "disconnect" });
    const events = listEvents(db, "shinon");
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(["disconnect", "status", "connect"]);
    expect(events[0].meta).toBeNull();
    expect(events[2].meta).toBe("pc");
    const limited = listEvents(db, "shinon", 2);
    expect(limited).toHaveLength(2);
    expect(limited[0].type).toBe("disconnect");
    db.close();
  });
});

describe("keys repo", () => {
  test("createAgentKey + findActiveKeyByHash + touchKey", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-1", agentName: "shinon" });
    const key = findActiveKeyByHash(db, "hash-1");
    expect(key).not.toBeNull();
    expect(key!.agent_name).toBe("shinon");
    expect(key!.created_by).toBe("human");
    expect(key!.kind_override).toBeNull();
    expect(key!.last_used_at).toBeNull();
    touchKey(db, key!.id);
    const touched = findActiveKeyByHash(db, "hash-1");
    expect(touched!.last_used_at).not.toBeNull();
    db.close();
  });

  test("revokeKeysForAgent makes findActiveKeyByHash return null", () => {
    const db = createDb(":memory:");
    registerAgent(db, "kirito", "agent");
    createAgentKey(db, { keyHash: "hash-2", agentName: "kirito" });
    expect(findActiveKeyByHash(db, "hash-2")).not.toBeNull();
    revokeKeysForAgent(db, "kirito");
    expect(findActiveKeyByHash(db, "hash-2")).toBeNull();
    expect(listKeys(db)[0].revoked_at).not.toBeNull();
    db.close();
  });

  test("listKeys returns all keys ordered by id", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "kirito", "agent");
    createAgentKey(db, { keyHash: "hash-1", agentName: "shinon", kindOverride: "agent" });
    createAgentKey(db, { keyHash: "hash-2", agentName: "kirito", createdBy: "system" });
    const keys = listKeys(db);
    expect(keys).toHaveLength(2);
    expect(keys[0].key_hash).toBe("hash-1");
    expect(keys[0].kind_override).toBe("agent");
    expect(keys[1].key_hash).toBe("hash-2");
    expect(keys[1].created_by).toBe("system");
    db.close();
  });

  test("createAgentKey stores scopes and budget_limit, defaults scopes to [\"*\"]", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-scoped", agentName: "shinon", scopes: ["fast", "pro"], budgetLimit: 50000 });
    const key = findActiveKeyByHash(db, "hash-scoped");
    expect(key).not.toBeNull();
    expect(JSON.parse(key!.scopes)).toEqual(["fast", "pro"]);
    expect(key!.budget_limit).toBe(50000);
    expect(key!.budget_used).toBe(0);

    createAgentKey(db, { keyHash: "hash-default", agentName: "shinon" });
    const def = findActiveKeyByHash(db, "hash-default");
    expect(JSON.parse(def!.scopes)).toEqual(["*"]);
    expect(def!.budget_limit).toBeNull();
    expect(def!.budget_used).toBe(0);
    db.close();
  });

  test("createAgentKey persists expires_at, budget_usd_limit, and budget_usd_used default 0", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, {
      keyHash: "hash-usd",
      agentName: "shinon",
      expiresAt: "2099-01-01T00:00:00Z",
      budgetUsdLimit: 12.5,
    });
    const row = db
      .query("SELECT expires_at, budget_usd_limit, budget_usd_used FROM agent_keys WHERE key_hash = ?")
      .get("hash-usd") as {
      expires_at: string | null;
      budget_usd_limit: number | null;
      budget_usd_used: number;
    };
    expect(row.expires_at).toBe("2099-01-01T00:00:00Z");
    expect(row.budget_usd_limit).toBe(12.5);
    expect(row.budget_usd_used).toBe(0);
    db.close();
  });

  test("createAgentKey without expiresAt/budgetUsdLimit defaults those columns to null and used to 0", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-no-usd", agentName: "shinon" });
    const row = db
      .query("SELECT expires_at, budget_usd_limit, budget_usd_used FROM agent_keys WHERE key_hash = ?")
      .get("hash-no-usd") as {
      expires_at: string | null;
      budget_usd_limit: number | null;
      budget_usd_used: number;
    };
    expect(row.expires_at).toBeNull();
    expect(row.budget_usd_limit).toBeNull();
    expect(row.budget_usd_used).toBe(0);
    db.close();
  });

  test("findActiveKeyByHash treats null expires_at as active", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-no-exp", agentName: "shinon" });
    expect(findActiveKeyByHash(db, "hash-no-exp")).not.toBeNull();
    db.close();
  });

  test("findActiveKeyByHash treats future expires_at as active", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-future", agentName: "shinon", expiresAt: "2099-01-01T00:00:00Z" });
    expect(findActiveKeyByHash(db, "hash-future")).not.toBeNull();
    db.close();
  });

  test("findActiveKeyByHash returns null for expired keys", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-past", agentName: "shinon", expiresAt: "1999-01-01T00:00:00Z" });
    expect(findActiveKeyByHash(db, "hash-past")).toBeNull();
    db.close();
  });

  test("listHumanKeys returns only human keys, newest id first, filtered by status", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "kirito", "agent");
    createAgentKey(db, { keyHash: "h-old", agentName: "shinon" });
    createAgentKey(db, { keyHash: "h-new", agentName: "kirito" });
    createAgentKey(db, { keyHash: "sys", agentName: "shinon", createdBy: "system" });
    const older = findActiveKeyByHash(db, "h-old")!;
    revokeKeyById(db, older.id);

    const active = listHumanKeys(db, "active");
    expect(active.map((k) => k.key_hash)).toEqual(["h-new"]);
    expect(active.every((k) => k.created_by === "human")).toBe(true);

    const revoked = listHumanKeys(db, "revoked");
    expect(revoked.map((k) => k.key_hash)).toEqual(["h-old"]);
    expect(revoked[0]!.revoked_at).not.toBeNull();

    expect(listKeys(db)).toHaveLength(3);
    db.close();
  });

  test("listHumanKeys active excludes unrevoked expired keys", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "h-live", agentName: "shinon" });
    createAgentKey(db, { keyHash: "h-expired", agentName: "shinon", expiresAt: "1999-01-01T00:00:00Z" });

    expect(listHumanKeys(db, "active").map((k) => k.key_hash)).toEqual(["h-live"]);
    expect(listHumanKeys(db, "revoked").map((k) => k.key_hash)).toEqual([]);
    db.close();
  });

  test("getKeyById returns the row or null", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "h-1", agentName: "shinon" });
    const id = findActiveKeyByHash(db, "h-1")!.id;
    expect(getKeyById(db, id)?.key_hash).toBe("h-1");
    expect(getKeyById(db, 99999)).toBeNull();
    db.close();
  });

  test("revokeKeyById revokes one row and leaves sibling keys of the same agent active", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "keep", agentName: "shinon" });
    createAgentKey(db, { keyHash: "drop", agentName: "shinon" });
    const dropId = findActiveKeyByHash(db, "drop")!.id;
    const keepId = findActiveKeyByHash(db, "keep")!.id;

    const revoked = revokeKeyById(db, dropId);
    expect(revoked).not.toBeNull();
    expect(revoked!.id).toBe(dropId);
    expect(revoked!.revoked_at).not.toBeNull();
    expect(findActiveKeyByHash(db, "drop")).toBeNull();
    expect(findActiveKeyByHash(db, "keep")!.id).toBe(keepId);

    expect(revokeKeyById(db, dropId)).toBeNull();
    expect(revokeKeyById(db, 99999)).toBeNull();
    db.close();
  });
});

describe("providers repo", () => {
  test("upsertProvider + listProviders + getProviderByName", () => {
    const db = createDb(":memory:");
    upsertProvider(db, { name: "opencode-go", baseUrl: "http://localhost:4343/v1", wireFormat: "openai", costPerMtok: 0.5 });
    upsertProvider(db, { name: "deepseek", baseUrl: "https://api.deepseek.com/v1" });
    const providers = listProviders(db);
    expect(providers.map((p) => p.name)).toEqual(["deepseek", "opencode-go"]);
    const p = getProviderByName(db, "opencode-go");
    expect(p).not.toBeNull();
    expect(p!.base_url).toBe("http://localhost:4343/v1");
    expect(p!.wire_format).toBe("openai");
    expect(p!.status).toBe("active");
    expect(p!.cost_per_mtok).toBe(0.5);
    expect(p!.api_key_enc).toBeNull();
    expect(p!.rpm_limit).toBeNull();
    expect(getProviderByName(db, "missing")).toBeNull();
    db.close();
  });

  test("upsertProvider updates existing row by name (ON CONFLICT)", () => {
    const db = createDb(":memory:");
    upsertProvider(db, { name: "pro", baseUrl: "http://a" });
    upsertProvider(db, { name: "pro", baseUrl: "http://b", wireFormat: "anthropic", status: "disabled", rpmLimit: 10, tpmLimit: 1000, costPerMtok: 0.1 });
    expect(listProviders(db)).toHaveLength(1);
    const p = getProviderByName(db, "pro")!;
    expect(p.base_url).toBe("http://b");
    expect(p.wire_format).toBe("anthropic");
    expect(p.status).toBe("disabled");
    expect(p.rpm_limit).toBe(10);
    expect(p.tpm_limit).toBe(1000);
    expect(p.cost_per_mtok).toBe(0.1);
    db.close();
  });

  test("setProviderStatus changes status", () => {
    const db = createDb(":memory:");
    upsertProvider(db, { name: "pro", baseUrl: "http://a" });
    setProviderStatus(db, "pro", "disabled");
    expect(getProviderByName(db, "pro")!.status).toBe("disabled");
    db.close();
  });
});

describe("provider_models repo", () => {
  test("addProviderModel + listProviderModels with defaults", () => {
    const db = createDb(":memory:");
    upsertProvider(db, { name: "pro", baseUrl: "http://a" });
    const provider = getProviderByName(db, "pro")!;
    addProviderModel(db, { providerId: provider.id, modelId: "gpt-4o", capabilities: '["chat","tools"]', contextWindow: 128000 });
    addProviderModel(db, { providerId: provider.id, modelId: "gpt-4o-mini" });
    const models = listProviderModels(db, provider.id);
    expect(models.map((m) => m.model_id)).toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(models[0].capabilities).toBe('["chat","tools"]');
    expect(models[0].context_window).toBe(128000);
    expect(models[1].capabilities).toBe("[]");
    expect(models[1].context_window).toBeNull();
    db.close();
  });

  test("addProviderModel updates on conflict", () => {
    const db = createDb(":memory:");
    upsertProvider(db, { name: "pro", baseUrl: "http://a" });
    const provider = getProviderByName(db, "pro")!;
    addProviderModel(db, { providerId: provider.id, modelId: "m", capabilities: "[]" });
    addProviderModel(db, { providerId: provider.id, modelId: "m", capabilities: '["vision"]', contextWindow: 2000 });
    const models = listProviderModels(db, provider.id);
    expect(models).toHaveLength(1);
    expect(models[0].capabilities).toBe('["vision"]');
    expect(models[0].context_window).toBe(2000);
    db.close();
  });
});

describe("model_routes repo", () => {
  test("upsertModelRoute + getModelRoute roundtrip fallback_chain JSON", () => {
    const db = createDb(":memory:");
    const chain = [
      { provider: "opencode-go", model: "deepseek-v4-pro" },
      { provider: "deepseek", model: "deepseek-chat" },
    ];
    upsertModelRoute(db, "pro", chain);
    const route = getModelRoute(db, "pro");
    expect(route).not.toBeNull();
    expect(JSON.parse(route!.fallback_chain)).toEqual(chain);
    expect(route!.created_at).not.toBeNull();
    expect(getModelRoute(db, "missing")).toBeNull();
    db.close();
  });

  test("upsertModelRoute overwrites fallback_chain and listModelRoutes orders by alias", () => {
    const db = createDb(":memory:");
    upsertModelRoute(db, "pro", [{ provider: "a", model: "m1" }]);
    upsertModelRoute(db, "fast", [{ provider: "b", model: "m2" }]);
    upsertModelRoute(db, "pro", [{ provider: "a", model: "m3" }]);
    const routes = listModelRoutes(db);
    expect(routes.map((r) => r.alias)).toEqual(["fast", "pro"]);
    expect(JSON.parse(getModelRoute(db, "pro")!.fallback_chain)).toEqual([{ provider: "a", model: "m3" }]);
    db.close();
  });
});

describe("consumeBudget", () => {
  test("key with budget consumes until limit then returns false", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-budget", agentName: "shinon", budgetLimit: 100 });
    expect(consumeBudget(db, "hash-budget", 60)).toBe(true);
    expect(consumeBudget(db, "hash-budget", 40)).toBe(true);
    expect(consumeBudget(db, "hash-budget", 1)).toBe(false);
    const key = findActiveKeyByHash(db, "hash-budget");
    expect(key!.budget_used).toBe(100);
    expect(key!.last_used_at).not.toBeNull();
    db.close();
  });

  test("key without budget_limit never fails", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-nolimit", agentName: "shinon" });
    expect(consumeBudget(db, "hash-nolimit", 10000000)).toBe(true);
    expect(findActiveKeyByHash(db, "hash-nolimit")!.budget_used).toBe(10000000);
    db.close();
  });

  test("consumeBudget on revoked key returns false", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-revoked", agentName: "shinon", budgetLimit: 100 });
    revokeKeysForAgent(db, "shinon");
    expect(consumeBudget(db, "hash-revoked", 10)).toBe(false);
    db.close();
  });

  test("consumeBudget on unknown key returns false", () => {
    const db = createDb(":memory:");
    expect(consumeBudget(db, "ghost-hash", 10)).toBe(false);
    db.close();
  });
});

describe("consumeBudgetUsd", () => {
  test("key with budget_usd_limit consumes until limit then returns false", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-usd-budget", agentName: "shinon", budgetUsdLimit: 10 });
    expect(consumeBudgetUsd(db, "hash-usd-budget", 6)).toBe(true);
    expect(consumeBudgetUsd(db, "hash-usd-budget", 4)).toBe(true);
    expect(consumeBudgetUsd(db, "hash-usd-budget", 0.01)).toBe(false);
    const row = db.query("SELECT budget_usd_used FROM agent_keys WHERE key_hash = ?").get("hash-usd-budget") as {
      budget_usd_used: number;
    };
    expect(row.budget_usd_used).toBe(10);
    db.close();
  });

  test("key without budget_usd_limit returns true without incrementing budget_usd_used", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-usd-nolimit", agentName: "shinon" });
    expect(consumeBudgetUsd(db, "hash-usd-nolimit", 99.99)).toBe(true);
    const row = db.query("SELECT budget_usd_used FROM agent_keys WHERE key_hash = ?").get("hash-usd-nolimit") as {
      budget_usd_used: number;
    };
    expect(row.budget_usd_used).toBe(0);
    db.close();
  });

  test("consumeBudgetUsd on revoked key returns false", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-usd-revoked", agentName: "shinon", budgetUsdLimit: 10 });
    revokeKeysForAgent(db, "shinon");
    expect(consumeBudgetUsd(db, "hash-usd-revoked", 1)).toBe(false);
    db.close();
  });

  test("consumeBudgetUsd on unknown key returns false", () => {
    const db = createDb(":memory:");
    expect(consumeBudgetUsd(db, "ghost-hash", 1)).toBe(false);
    db.close();
  });

  test("usd=0 with limit set returns true and used does not change", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-usd-zero", agentName: "shinon", budgetUsdLimit: 10 });
    expect(consumeBudgetUsd(db, "hash-usd-zero", 0)).toBe(true);
    const row = db.query("SELECT budget_usd_used FROM agent_keys WHERE key_hash = ?").get("hash-usd-zero") as {
      budget_usd_used: number;
    };
    expect(row.budget_usd_used).toBe(0);
    db.close();
  });

  test("consumeBudgetUsd accepts increment equal to limit when compared as micro-USD", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-usd-micro", agentName: "shinon", budgetUsdLimit: 0.03 });
    expect(consumeBudgetUsd(db, "hash-usd-micro", (30 / 1e6) * 1000)).toBe(true);
    const row = db.query("SELECT budget_usd_used FROM agent_keys WHERE key_hash = ?").get("hash-usd-micro") as {
      budget_usd_used: number;
    };
    expect(row.budget_usd_used).toBeCloseTo(0.03);
    db.close();
  });
});

describe("usage_log repo", () => {
  test("logUsage inserts a row and listUsage returns newest first", () => {
    const db = createDb(":memory:");
    logUsage(db, {
      agentName: "shinon",
      keyHash: "hash-a",
      providerId: 1,
      providerName: "mock-a",
      modelId: "test-model",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    logUsage(db, {
      agentName: "kirito",
      keyHash: "hash-b",
      providerId: 2,
      providerName: "mock-b",
      modelId: "other",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    });

    const rows = listUsage(db);
    expect(rows).toHaveLength(2);
    expect(rows[0].agent_name).toBe("kirito");
    expect(rows[0].key_hash).toBe("hash-b");
    expect(rows[0].provider_id).toBe(2);
    expect(rows[0].provider_name).toBe("mock-b");
    expect(rows[0].model_id).toBe("other");
    expect(rows[0].prompt_tokens).toBe(1);
    expect(rows[0].completion_tokens).toBe(1);
    expect(rows[0].total_tokens).toBe(2);
    expect(rows[1].agent_name).toBe("shinon");
    expect(rows[1].total_tokens).toBe(15);

    const limited = listUsage(db, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0].agent_name).toBe("kirito");
    db.close();
  });
});

describe("getSystemCounts", () => {
  test("returns zeros on empty db", () => {
    const db = createDb(":memory:");
    expect(getSystemCounts(db)).toEqual({
      agentsTotal: 0,
      agentsOnline: 0,
      keysActive: 0,
      keysRevoked: 0,
    });
    db.close();
  });

  test("counts agents and keys by status", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    registerAgent(db, "kirito", "agent");
    upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });
    createAgentKey(db, { keyHash: "active-1", agentName: "shinon" });
    createAgentKey(db, { keyHash: "active-2", agentName: "kirito" });
    revokeKeysForAgent(db, "kirito");

    expect(getSystemCounts(db)).toEqual({
      agentsTotal: 2,
      agentsOnline: 1,
      keysActive: 1,
      keysRevoked: 1,
    });
    db.close();
  });

  test("keysActive and keysRevoked count only created_by=human", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "human-live", agentName: "shinon" });
    createAgentKey(db, { keyHash: "human-dead", agentName: "shinon" });
    createAgentKey(db, { keyHash: "sys-live", agentName: "shinon", createdBy: "system" });
    createAgentKey(db, { keyHash: "sys-dead", agentName: "shinon", createdBy: "system" });
    revokeKeyById(db, findActiveKeyByHash(db, "human-dead")!.id);
    revokeKeyById(db, findActiveKeyByHash(db, "sys-dead")!.id);

    expect(getSystemCounts(db)).toEqual({
      agentsTotal: 1,
      agentsOnline: 0,
      keysActive: 1,
      keysRevoked: 1,
    });
    db.close();
  });

  test("keysActive does not count unrevoked expired human keys", () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "h-live", agentName: "shinon" });
    createAgentKey(db, { keyHash: "h-expired", agentName: "shinon", expiresAt: "1999-01-01T00:00:00Z" });

    expect(getSystemCounts(db)).toEqual({
      agentsTotal: 1,
      agentsOnline: 0,
      keysActive: 1,
      keysRevoked: 0,
    });
    db.close();
  });
});

describe("memory_mirror repo", () => {
  test("getMemoryMirror returns null for missing rows", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    expect(getMemoryMirror(db, "hermes", "memory")).toBeNull();
    expect(getMemoryMirror(db, "hermes", "user")).toBeNull();
    expect(getMemoryMirror(db, "nobody", "memory")).toBeNull();
    db.close();
  });

  test("upsertMemoryMirror inserts with char_count from content and default sync_direction", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertMemoryMirror(db, "hermes", "memory", { content: "hola mundo" });
    const m = getMemoryMirror(db, "hermes", "memory");
    expect(m).not.toBeNull();
    expect(m!.profile_name).toBe("hermes");
    expect(m!.target).toBe("memory");
    expect(m!.content).toBe("hola mundo");
    expect(m!.char_count).toBe(10);
    expect(m!.content_hash).toBeNull();
    expect(m!.last_synced).toBeNull();
    expect(m!.sync_direction).toBe("local_primary");
    db.close();
  });

  test("upsertMemoryMirror with explicit sync_direction and content_hash", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertMemoryMirror(db, "hermes", "user", {
      content: "USER.md",
      content_hash: "abc123",
      sync_direction: "bidirectional",
    });
    const m = getMemoryMirror(db, "hermes", "user");
    expect(m!.content_hash).toBe("abc123");
    expect(m!.sync_direction).toBe("bidirectional");
    expect(m!.char_count).toBe(7);
    db.close();
  });

  test("upsertMemoryMirror updates existing row, recomputes char_count and bumps last_synced", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertMemoryMirror(db, "hermes", "memory", { content: "hola" });
    expect(getMemoryMirror(db, "hermes", "memory")!.char_count).toBe(4);
    expect(getMemoryMirror(db, "hermes", "memory")!.last_synced).toBeNull();
    upsertMemoryMirror(db, "hermes", "memory", { content: "hola mundo" });
    expect(selectCount(db, "SELECT COUNT(*) AS count FROM memory_mirror")).toBe(1);
    const m = getMemoryMirror(db, "hermes", "memory");
    expect(m!.content).toBe("hola mundo");
    expect(m!.char_count).toBe(10);
    expect(m!.last_synced).not.toBeNull();
    db.close();
  });

  test("upsertMemoryMirror update preserves fields not sent", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertMemoryMirror(db, "hermes", "memory", {
      content: "hola",
      content_hash: "abc",
      sync_direction: "cardinal_primary",
    });
    upsertMemoryMirror(db, "hermes", "memory", { content_hash: "def" });
    const m = getMemoryMirror(db, "hermes", "memory");
    expect(m!.content).toBe("hola");
    expect(m!.char_count).toBe(4);
    expect(m!.content_hash).toBe("def");
    expect(m!.sync_direction).toBe("cardinal_primary");
    expect(m!.last_synced).not.toBeNull();
    db.close();
  });

  test("upsertMemoryMirror throws on unknown profile (FK)", () => {
    const db = createDb(":memory:");
    expect(() => upsertMemoryMirror(db, "ghost", "memory", { content: "x" })).toThrow();
    db.close();
  });
});

describe("sessions repo", () => {
  test("listSessions returns empty on empty db", () => {
    const db = createDb(":memory:");
    expect(listSessions(db)).toEqual([]);
    db.close();
  });

  test("listSessions ordered by started_at DESC with profile_name via JOIN", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertProfile(db, "shinon", {});
    upsertSession(db, { id: "s1", profile_name: "hermes", started_at: 100 });
    upsertSession(db, { id: "s2", profile_name: "shinon", started_at: 300 });
    upsertSession(db, { id: "s3", profile_name: "hermes", started_at: 200 });
    const sessions = listSessions(db);
    expect(sessions.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    expect(sessions[0].profile_name).toBe("shinon");
    db.close();
  });

  test("getSession returns row for existing id and null for missing", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSession(db, { id: "s1", profile_name: "hermes", title: "Hola", started_at: 100 });
    const s = getSession(db, "s1");
    expect(s).not.toBeNull();
    expect(s!.profile_name).toBe("hermes");
    expect(s!.title).toBe("Hola");
    expect(getSession(db, "missing")).toBeNull();
    db.close();
  });

  test("upsertSession inserts with defaults for counters", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSession(db, { id: "s1", profile_name: "hermes", title: "Hola", started_at: 100 });
    const s = getSession(db, "s1");
    expect(s).not.toBeNull();
    expect(s!.message_count).toBe(0);
    expect(s!.input_tokens).toBe(0);
    expect(s!.output_tokens).toBe(0);
    expect(s!.estimated_cost).toBe(0);
    db.close();
  });

  test("upsertSession updates existing row by id and preserves unset fields", () => {
    const db = createDb(":memory:");
    upsertProfile(db, "hermes", {});
    upsertSession(db, {
      id: "s1",
      profile_name: "hermes",
      title: "Hola",
      started_at: 100,
      message_count: 5,
    });
    upsertSession(db, { id: "s1", profile_name: "hermes", title: "Chau", input_tokens: 50 });
    expect(selectCount(db, "SELECT COUNT(*) AS count FROM sessions_index")).toBe(1);
    const s = getSession(db, "s1");
    expect(s!.title).toBe("Chau");
    expect(s!.started_at).toBe(100);
    expect(s!.message_count).toBe(5);
    expect(s!.input_tokens).toBe(50);
    expect(s!.output_tokens).toBe(0);
    expect(s!.estimated_cost).toBe(0);
    db.close();
  });

  test("upsertSession throws on unknown profile (FK)", () => {
    const db = createDb(":memory:");
    expect(() => upsertSession(db, { id: "s1", profile_name: "ghost" })).toThrow();
    db.close();
  });
});
