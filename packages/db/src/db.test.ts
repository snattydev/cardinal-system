import { describe, expect, test } from "bun:test";
import { createDb, migrate } from "./schema";
import {
  addSkillToProfile,
  createAgentKey,
  findActiveKeyByHash,
  getAgent,
  getMemoryMirror,
  getProfile,
  getSkill,
  getSoul,
  getSystemCounts,
  insertEvent,
  listAgents,
  listEvents,
  listKeys,
  listProfiles,
  listSkills,
  listSkillsForProfile,
  markAgentDisconnected,
  registerAgent,
  revokeKeysForAgent,
  touchKey,
  updateAgentStatus,
  upsertAgentOnConnect,
  upsertMemoryMirror,
  upsertProfile,
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
  test("migrate creates the 8 tables and sets user_version to 5", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toEqual([
      "agent_events",
      "agent_keys",
      "agents",
      "memory_mirror",
      "profile_skills",
      "profiles",
      "skills",
      "souls",
    ]);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(5);
    db.close();
  });

  test("createDb + migrate are idempotent", () => {
    const db = createDb(":memory:");
    migrate(db);
    migrate(db);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(5);
    expect(tableNames(db)).toHaveLength(8);
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
