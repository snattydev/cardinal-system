import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { Config } from "./config";
import { createDb } from "./db/index";
import { createAgentKey, getAgent, registerAgent } from "./db/repos";
import { generateKey, hashKey } from "./keys";
import { createServer } from "./server";

const TEST_KEY = generateKey();
const LOCAL_KEY = generateKey();

let server: ReturnType<typeof createServer>;
let port: number;
let db: Database;

function testConfig(hash: string): Config {
  return {
    port: 0,
    dbPath: ":memory:",
    adminUser: "admin",
    adminPasswordHash: hash,
    jwtSecret: "it-secret",
    staticDir: "/nonexistent",
    pingIntervalMs: 10_000,
  };
}

beforeAll(async () => {
  const passwordHash = await Bun.password.hash("sao123");
  db = createDb(":memory:");
  registerAgent(db, "shinon", "agent");
  createAgentKey(db, { keyHash: hashKey(TEST_KEY), agentName: "shinon" });
  registerAgent(db, "localbot", "agent");
  createAgentKey(db, { keyHash: hashKey(LOCAL_KEY), agentName: "localbot" });
  server = createServer(testConfig(passwordHash), db);
  port = server.port;
});

afterAll(() => {
  server.stop(true);
});

function connectWs(cookie?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://localhost:${port}/ws`,
      cookie ? ({ headers: { cookie } } as never) : undefined,
    );
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error("ws connect failed"));
  });
}

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener("message", function h(ev) {
      ws.removeEventListener("message", h);
      resolve(JSON.parse(String(ev.data)));
    });
  });
}

async function login(): Promise<string> {
  const res = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: "admin", password: "sao123" }),
  });
  if (!res.ok) throw new Error(`login failed with status ${res.status}`);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

test("GET /api/health returns status ok and version", async () => {
  const res = await fetch(`http://localhost:${port}/api/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", version: "0.0.1" });
});

test("auth flow: bad login 401, good login sets cookie, /me with and without cookie", async () => {
  const bad = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: "admin", password: "wrong" }),
  });
  expect(bad.status).toBe(401);

  const ok = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: "admin", password: "sao123" }),
  });
  expect(ok.status).toBe(200);
  const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
  expect(cookie.startsWith("cardinal_session=")).toBe(true);

  const me = await fetch(`http://localhost:${port}/api/auth/me`, { headers: { cookie } });
  expect(me.status).toBe(200);
  expect(await me.json()).toEqual({ user: "admin" });

  const anon = await fetch(`http://localhost:${port}/api/auth/me`);
  expect(anon.status).toBe(401);
});

test("GET /api/agents requires a session cookie", async () => {
  const anon = await fetch(`http://localhost:${port}/api/agents`);
  expect(anon.status).toBe(401);

  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/agents`, { headers: { cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { agents: unknown[] };
  expect(Array.isArray(body.agents)).toBe(true);
});

test("agent flow: hello → welcome → roster → pong status → bye disconnect", async () => {
  const cookie = await login();
  const ws = await connectWs();
  ws.send(JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc", status: "idle" }));
  const welcome = await nextMessage(ws);
  expect(welcome).toEqual({ type: "welcome", agent: "shinon", kind: "agent" });

  const list = await fetch(`http://localhost:${port}/api/agents`, { headers: { cookie } });
  const { agents } = (await list.json()) as { agents: any[] };
  const shinon = agents.find((a: any) => a.name === "shinon");
  expect(shinon.connected).toBe(true);

  ws.send(JSON.stringify({ type: "pong", status: "busy" }));
  await Bun.sleep(30);
  const detail1 = (await (
    await fetch(`http://localhost:${port}/api/agents/shinon`, { headers: { cookie } })
  ).json()) as any;
  expect(detail1.agent.status).toBe("busy");
  expect(detail1.events.length).toBeGreaterThan(0);

  ws.send(JSON.stringify({ type: "bye" }));
  await Bun.sleep(30);
  const detail2 = (await (
    await fetch(`http://localhost:${port}/api/agents/shinon`, { headers: { cookie } })
  ).json()) as any;
  expect(detail2.agent.connected).toBe(false);
  expect(detail2.events.some((e: any) => e.type === "disconnect")).toBe(true);

  ws.close();
});

test("dashboard flow: subscribe → roster, then agent_update on agent hello", async () => {
  const cookie = await login();
  const dash = await connectWs(cookie);
  dash.send(JSON.stringify({ type: "subscribe" }));
  const roster = await nextMessage(dash);
  expect(roster.type).toBe("roster");
  expect(Array.isArray(roster.agents)).toBe(true);

  const agent = await connectWs();
  agent.send(JSON.stringify({ type: "hello", key: TEST_KEY, device: "pc", status: "idle" }));
  const welcome = await nextMessage(agent);
  expect(welcome.type).toBe("welcome");

  const update = await nextMessage(dash);
  expect(update.type).toBe("agent_update");
  expect(update.agent.name).toBe("shinon");
  expect(update.agent.connected).toBe(true);

  agent.send(JSON.stringify({ type: "bye" }));
  await Bun.sleep(30);
  agent.close();
  dash.close();
});

test("hello with an unknown key is rejected with auth_failed", async () => {
  const ws = await connectWs();
  ws.send(
    JSON.stringify({
      type: "hello",
      key: "sk-cardinal-" + "ff".repeat(32),
      device: "pc",
      status: "idle",
    }),
  );
  const msg = await nextMessage(ws);
  expect(msg).toEqual({ type: "error", reason: "auth_failed" });
  ws.close();
});

test("device localhost is classified as subagent", async () => {
  const ws = await connectWs();
  ws.send(JSON.stringify({ type: "hello", key: LOCAL_KEY, device: "localhost", status: "idle" }));
  const welcome = await nextMessage(ws);
  expect(welcome).toEqual({ type: "welcome", agent: "localbot", kind: "subagent" });
  ws.send(JSON.stringify({ type: "bye" }));
  await Bun.sleep(30);
  ws.close();
});

test("ping timeout disconnects an agent that misses 2 pings", async () => {
  const key = generateKey();
  const db2 = createDb(":memory:");
  registerAgent(db2, "pinger", "agent");
  createAgentKey(db2, { keyHash: hashKey(key), agentName: "pinger" });
  const server2 = createServer({ ...testConfig("unused"), pingIntervalMs: 40 }, db2);
  const port2 = server2.port;

  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const sock = new WebSocket(`ws://localhost:${port2}/ws`);
    sock.onopen = () => resolve(sock);
    sock.onerror = () => reject(new Error("ws connect failed"));
  });
  ws.send(JSON.stringify({ type: "hello", key, device: "pc", status: "idle" }));
  await Bun.sleep(160);

  const row = getAgent(db2, "pinger");
  expect(row?.connected).toBe(0);

  ws.close();
  server2.stop(true);
});
