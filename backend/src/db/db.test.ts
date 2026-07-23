import { describe, expect, test } from "bun:test";
import { createDb, migrate } from "./index";
import {
  createAgentKey,
  findActiveKeyByHash,
  getAgent,
  insertEvent,
  listAgents,
  listEvents,
  listKeys,
  markAgentDisconnected,
  registerAgent,
  revokeKeysForAgent,
  touchKey,
  updateAgentStatus,
  upsertAgentOnConnect,
} from "./repos";

function tableNames(db: ReturnType<typeof createDb>): string[] {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe("migrations", () => {
  test("migrate creates the 3 tables and sets user_version to 1", () => {
    const db = createDb(":memory:");
    expect(tableNames(db)).toEqual(["agent_events", "agent_keys", "agents"]);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(1);
    db.close();
  });

  test("createDb + migrate are idempotent", () => {
    const db = createDb(":memory:");
    migrate(db);
    migrate(db);
    const row = db.query("PRAGMA user_version").get() as { user_version: number };
    expect(row.user_version).toBe(1);
    expect(tableNames(db)).toHaveLength(3);
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
