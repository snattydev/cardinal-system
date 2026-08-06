import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { ServerWebSocket } from "bun";
import { createDb, createAgentKey, getAgent, listEvents, registerAgent } from "@cardinal/db";
import { hashKey } from "@cardinal/keys";
import { Hub } from "./hub";
import type { ConnData } from "./hub";

const TEST_KEY = "sk-cardinal-" + "ab".repeat(32);

function mockWs(data: Partial<ConnData> = {}) {
  const sent: unknown[] = [];
  const closed: Array<{ code?: number; reason?: string }> = [];
  const ws = {
    data: { dashboardAuthed: false, role: null, agentName: null, ...data },
    send: (s: string) => sent.push(JSON.parse(s)),
    close: (code?: number, reason?: string) => closed.push({ code, reason }),
  } as unknown as ServerWebSocket<ConnData>;
  return { ws, sent, closed };
}

const hubs: Hub[] = [];
const dbs: Database[] = [];

function makeHub(opts: { pingIntervalMs?: number; kindOverride?: "agent" | "subagent" } = {}) {
  const db = createDb(":memory:");
  registerAgent(db, "shinon", "agent");
  createAgentKey(db, {
    keyHash: hashKey(TEST_KEY),
    agentName: "shinon",
    ...(opts.kindOverride ? { kindOverride: opts.kindOverride } : {}),
  });
  const hub = new Hub(db, { pingIntervalMs: opts.pingIntervalMs ?? 30_000 });
  hubs.push(hub);
  dbs.push(db);
  return { db, hub };
}

afterEach(() => {
  for (const hub of hubs) hub.dispose();
  for (const db of dbs) db.close();
  hubs.length = 0;
  dbs.length = 0;
});

describe("Hub", () => {
  test("hello con key válida → welcome, agente conectado y evento connect", () => {
    const { db, hub } = makeHub();
    const { ws, sent } = mockWs();
    hub.websocket.message(ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc", status: "idle" }));

    expect(sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });
    const row = getAgent(db, "shinon");
    expect(row?.connected).toBe(1);
    expect(row?.device).toBe("pc");
    expect(row?.kind).toBe("agent");
    expect(listEvents(db, "shinon").some((e) => e.type === "connect")).toBe(true);
  });

  test("hello con key inválida (formato malo o desconocida) → auth_failed + close 4401", () => {
    const { hub } = makeHub();

    const badFormat = mockWs();
    hub.websocket.message(badFormat.ws, JSON.stringify({ type: "hello", key: "not-a-key", device: "pc" }));
    expect(badFormat.sent[0]).toEqual({ type: "error", reason: "auth_failed" });
    expect(badFormat.closed[0]).toEqual({ code: 4401, reason: "auth_failed" });

    const unknown = mockWs();
    hub.websocket.message(unknown.ws, JSON.stringify({ type: "hello", key: "sk-cardinal-" + "cd".repeat(32), device: "pc" }));
    expect(unknown.sent[0]).toEqual({ type: "error", reason: "auth_failed" });
    expect(unknown.closed[0]).toEqual({ code: 4401, reason: "auth_failed" });
  });

  test("clasificación: localhost → subagent; kind_override de la key gana al device", () => {
    const a = makeHub();
    const local = mockWs();
    a.hub.websocket.message(local.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "localhost" }));
    expect(local.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "subagent" });
    expect(getAgent(a.db, "shinon")?.kind).toBe("subagent");

    const b = makeHub({ kindOverride: "subagent" });
    const pc = mockWs();
    b.hub.websocket.message(pc.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
    expect(pc.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "subagent" });
    expect(getAgent(b.db, "shinon")?.kind).toBe("subagent");
  });

  test("mensaje inválido (no JSON o type desconocido) → invalid_message + close 4400", () => {
    const { hub } = makeHub();

    const notJson = mockWs();
    hub.websocket.message(notJson.ws, "{oops");
    expect(notJson.sent[0]).toEqual({ type: "error", reason: "invalid_message" });
    expect(notJson.closed[0]).toEqual({ code: 4400, reason: "invalid_message" });

    const unknownType = mockWs();
    hub.websocket.message(unknownType.ws, JSON.stringify({ type: "task" }));
    expect(unknownType.sent[0]).toEqual({ type: "error", reason: "invalid_message" });
    expect(unknownType.closed[0]).toEqual({ code: 4400, reason: "invalid_message" });
  });

  test("subscribe sin dashboardAuthed → auth_failed + close 4401", () => {
    const { hub } = makeHub();
    const { ws, sent, closed } = mockWs({ dashboardAuthed: false });
    hub.websocket.message(ws, JSON.stringify({ type: "subscribe" }));
    expect(sent[0]).toEqual({ type: "error", reason: "auth_failed" });
    expect(closed[0]).toEqual({ code: 4401, reason: "auth_failed" });
  });

  test("subscribe autenticado → roster, y agent_update cuando conecta un agente", () => {
    const { hub } = makeHub();
    const dash = mockWs({ dashboardAuthed: true });
    hub.websocket.message(dash.ws, JSON.stringify({ type: "subscribe" }));

    const roster = dash.sent[0] as { type: string; agents: Array<Record<string, unknown>> };
    expect(roster.type).toBe("roster");
    expect(roster.agents).toHaveLength(1);
    expect(roster.agents[0]).toMatchObject({ name: "shinon", connected: false });

    const agent = mockWs();
    hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));

    const update = dash.sent[1] as { type: string; agent: Record<string, unknown> };
    expect(update.type).toBe("agent_update");
    expect(update.agent).toMatchObject({ name: "shinon", connected: true });
  });

  test("pong con status nuevo actualiza + evento + broadcast; mismo status no emite evento", () => {
    const { db, hub } = makeHub();
    const dash = mockWs({ dashboardAuthed: true });
    hub.websocket.message(dash.ws, JSON.stringify({ type: "subscribe" }));

    const agent = mockWs();
    hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));

    hub.websocket.message(agent.ws, JSON.stringify({ type: "pong", status: "busy" }));
    expect(getAgent(db, "shinon")?.status).toBe("busy");
    expect(listEvents(db, "shinon").filter((e) => e.type === "status")).toHaveLength(1);
    const broadcast = dash.sent[dash.sent.length - 1] as { type: string; agent: { status: string } };
    expect(broadcast.type).toBe("agent_update");
    expect(broadcast.agent.status).toBe("busy");

    const dashCount = dash.sent.length;
    hub.websocket.message(agent.ws, JSON.stringify({ type: "pong", status: "busy" }));
    expect(listEvents(db, "shinon").filter((e) => e.type === "status")).toHaveLength(1);
    expect(dash.sent).toHaveLength(dashCount);
  });

  test("bye → desconecta, evento disconnect, broadcast y close 1000", () => {
    const { db, hub } = makeHub();
    const dash = mockWs({ dashboardAuthed: true });
    hub.websocket.message(dash.ws, JSON.stringify({ type: "subscribe" }));

    const agent = mockWs();
    hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
    hub.websocket.message(agent.ws, JSON.stringify({ type: "bye" }));

    expect(getAgent(db, "shinon")?.connected).toBe(0);
    expect(listEvents(db, "shinon").some((e) => e.type === "disconnect")).toBe(true);
    expect(agent.closed[0]).toEqual({ code: 1000, reason: "bye" });
    const msgs = dash.sent as Array<{ type: string; agent?: { connected: boolean }; devices?: unknown[] }>;
    const updates = msgs.filter((m) => m.type === "agent_update");
    expect(updates[updates.length - 1].agent?.connected).toBe(false);
    const deviceUpdates = msgs.filter((m) => m.type === "devices_update");
    expect(deviceUpdates).toHaveLength(2);
    const lastDevices = deviceUpdates[deviceUpdates.length - 1].devices as Array<{ id: string }>;
    expect(lastDevices[0]).toMatchObject({ id: "pc" });
  });

  test("hello emite devices_update a dashboards después de agent_update", () => {
    const { hub } = makeHub();
    const dash = mockWs({ dashboardAuthed: true });
    hub.websocket.message(dash.ws, JSON.stringify({ type: "subscribe" }));

    const agent = mockWs();
    hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc", status: "idle" }));

    const updates = dash.sent.filter((m) => (m as { type: string }).type === "agent_update");
    expect(updates).toHaveLength(1);
    const devicesMsg = dash.sent.find((m) => (m as { type: string }).type === "devices_update") as {
      type: string;
      devices: Array<Record<string, unknown>>;
    };
    expect(devicesMsg.type).toBe("devices_update");
    expect(Array.isArray(devicesMsg.devices)).toBe(true);
    expect(devicesMsg.devices).toHaveLength(1);
    expect(devicesMsg.devices[0]).toMatchObject({ id: "pc", agents: 1 });
  });

  test("dos pings sin pong → desconecta y cierra con ping_timeout", async () => {
    const { db, hub } = makeHub({ pingIntervalMs: 30 });
    const agent = mockWs();
    hub.websocket.message(agent.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
    expect(getAgent(db, "shinon")?.connected).toBe(1);

    await Bun.sleep(95);

    expect(getAgent(db, "shinon")?.connected).toBe(0);
    expect(agent.closed[0]).toEqual({ code: 4000, reason: "ping_timeout" });
    expect(agent.sent.some((m) => (m as { type: string }).type === "ping")).toBe(true);
    expect(listEvents(db, "shinon").some((e) => e.type === "disconnect")).toBe(true);
  });

  test("doble hello: la sesión vieja se cierra 'replaced' y su close tardío no desconecta al agente", () => {
    const { db, hub } = makeHub();
    const first = mockWs();
    hub.websocket.message(first.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
    expect(first.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });

    const second = mockWs();
    hub.websocket.message(second.ws, JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc" }));
    expect(first.closed[0]).toEqual({ code: 4000, reason: "replaced" });
    expect(second.sent[0]).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });
    expect(getAgent(db, "shinon")?.connected).toBe(1);

    // Anti-replace guard: old socket's close does NOT disconnect
    hub.websocket.close(first.ws);
    expect(getAgent(db, "shinon")?.connected).toBe(1);

    // Active session's close DOES disconnect
    hub.websocket.close(second.ws);
    expect(getAgent(db, "shinon")?.connected).toBe(0);
  });
});
