import { describe, expect, test } from "bun:test";
import { createDb } from "../db/index";
import { insertEvent, registerAgent, upsertAgentOnConnect } from "../db/repos";
import { handleHealth } from "./health";
import { handleGetAgent, handleListAgents } from "./agents";
import rootPkg from "../../../package.json";

describe("handleHealth", () => {
  test("200 con status ok y la versión del package.json raíz", async () => {
    const res = handleHealth();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ status: "ok", version: rootPkg.version });
    expect(rootPkg.version).toBe("0.1.0");
  });
});

describe("handleListAgents", () => {
  test("DB vacía → {agents: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListAgents(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ agents: [] });
    db.close();
  });

  test("con un agente conectado → AgentPayload con connected boolean y lastSeen string", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });

    const res = handleListAgents(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: Array<Record<string, unknown>> };
    expect(body.agents).toHaveLength(1);
    const shinon = body.agents[0];
    expect(shinon).toMatchObject({ name: "shinon", device: "pc", kind: "agent", status: "idle" });
    expect(shinon.connected).toBe(true);
    expect(typeof shinon.lastSeen).toBe("string");
    db.close();
  });
});

describe("handleGetAgent", () => {
  test("agente desconocido → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleGetAgent(db, "nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("agente conocido → 200 con agent y últimos 20 eventos en DESC", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    upsertAgentOnConnect(db, { name: "shinon", device: "pc", kind: "agent", status: "idle" });
    for (let i = 1; i <= 25; i++) {
      insertEvent(db, { agentName: "shinon", type: "status", meta: `s${i}` });
    }

    const res = handleGetAgent(db, "shinon");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      agent: Record<string, unknown>;
      events: Array<{ id: number; meta: string }>;
    };
    expect(body.agent).toMatchObject({ name: "shinon", connected: true });
    expect(body.events).toHaveLength(20);
    expect(body.events[0].meta).toBe("s25");
    expect(body.events[19].meta).toBe("s6");
    db.close();
  });
});
