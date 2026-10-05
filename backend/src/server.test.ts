import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { Config } from "@cardinal/core";
import {
  addProviderModel,
  createAgentKey,
  createDb,
  getAgent,
  getProviderByName,
  registerAgent,
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";
import { createServer } from "./server";
import rootPkg from "../../package.json";

const TEST_KEY = generateKey();
const LOCAL_KEY = generateKey();

let server: ReturnType<typeof createServer>;
let port = 0;
let db: Database;

function testConfig(hash: string): Config {
  return {
    port: 0,
    dbPath: ":memory:",
    adminUser: "admin",
    adminPasswordHash: hash,
    jwtSecret: "it-secret",
    poolSecret: "test-pool-secret",
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
  port = server.port!;
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
  expect(await res.json()).toEqual({ status: "ok", version: rootPkg.version });
});

test("POST /v1/chat/completions without Bearer returns 401", async () => {
  const res = await fetch(`http://localhost:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "test-model", messages: [] }),
  });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});

test("POST /api/internal/keys/validate: valid key → agent info, invalid → 401", async () => {
  const ok = await fetch(`http://localhost:${port}/api/internal/keys/validate`, {
    method: "POST",
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ agent: "shinon", kind: "agent", scopes: ["*"] });

  const bad = await fetch(`http://localhost:${port}/api/internal/keys/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: generateKey() }),
  });
  expect(bad.status).toBe(401);
  expect(await bad.json()).toEqual({ error: "unauthorized" });
});

test("GET /v1/models returns OpenAI list format", async () => {
  const res = await fetch(`http://localhost:${port}/v1/models`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ object: "list", data: [] });
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

test("POST /api/auth/logout forwards X-Forwarded-Proto into the Secure cookie flag", async () => {
  const secure = await fetch(`http://localhost:${port}/api/auth/logout`, {
    method: "POST",
    headers: { "x-forwarded-proto": "https" },
  });
  expect(secure.status).toBe(200);
  const secureCookie = secure.headers.get("set-cookie") ?? "";
  expect(secureCookie).toContain("Secure");
  expect(secureCookie).toContain("Max-Age=0");

  const plain = await fetch(`http://localhost:${port}/api/auth/logout`, { method: "POST" });
  expect(plain.status).toBe(200);
  expect(plain.headers.get("set-cookie") ?? "").not.toContain("Secure");
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

test("GET /api/devices requires a session cookie and returns devices", async () => {
  const anon = await fetch(`http://localhost:${port}/api/devices`);
  expect(anon.status).toBe(401);

  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/devices`, { headers: { cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { devices: unknown[] };
  expect(Array.isArray(body.devices)).toBe(true);
});

test("POST /api/devices/heartbeat persists device info", async () => {
  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/devices/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      agent: "shinon",
      info: { hostname: "home-pc", platform: "linux", arch: "x86_64", ram_gb: 64, ip: "10.0.0.2" },
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { device: Record<string, unknown> };
  expect(body.device).toMatchObject({ id: "home-pc", hostname: "home-pc", platform: "linux", ram_gb: 64 });
});

test("POST /api/devices/heartbeat with unknown agent → 404 and without cookie → 401", async () => {
  const anon = await fetch(`http://localhost:${port}/api/devices/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "shinon", info: { hostname: "x" } }),
  });
  expect(anon.status).toBe(401);

  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/devices/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ agent: "ghost", info: { hostname: "x" } }),
  });
  expect(res.status).toBe(404);
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

test("GET /api/keys and POST /api/keys/:id/revoke require a session cookie", async () => {
  const anonGet = await fetch(`http://localhost:${port}/api/keys`);
  expect(anonGet.status).toBe(401);
  expect(await anonGet.json()).toEqual({ error: "unauthorized" });

  const anonPost = await fetch(`http://localhost:${port}/api/keys/1/revoke`, { method: "POST" });
  expect(anonPost.status).toBe(401);

  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/keys`, { headers: { cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { keys: unknown[] };
  expect(Array.isArray(body.keys)).toBe(true);
});

test("POST /api/keys requires a session cookie and creates a key for shinon", async () => {
  const anon = await fetch(`http://localhost:${port}/api/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentName: "shinon" }),
  });
  expect(anon.status).toBe(401);
  expect(await anon.json()).toEqual({ error: "unauthorized" });

  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/keys`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ agentName: "shinon" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { key: string; item: { agentName: string } };
  expect(body.key.startsWith("sk-cardinal-")).toBe(true);
  expect(body.item.agentName).toBe("shinon");
});

test("GET /api/router/providers and GET /api/router/routes without cookie → 401", async () => {
  const providers = await fetch(`http://localhost:${port}/api/router/providers`);
  expect(providers.status).toBe(401);
  expect(await providers.json()).toEqual({ error: "unauthorized" });

  const routes = await fetch(`http://localhost:${port}/api/router/routes`);
  expect(routes.status).toBe(401);
  expect(await routes.json()).toEqual({ error: "unauthorized" });
});

test("GET /api/router/providers and GET /api/router/routes with session cookie → 200", async () => {
  const cookie = await login();

  const providers = await fetch(`http://localhost:${port}/api/router/providers`, { headers: { cookie } });
  expect(providers.status).toBe(200);
  const providersBody = (await providers.json()) as { providers: unknown[]; models: unknown[] };
  expect(Array.isArray(providersBody.providers)).toBe(true);
  expect(Array.isArray(providersBody.models)).toBe(true);

  const routes = await fetch(`http://localhost:${port}/api/router/routes`, { headers: { cookie } });
  expect(routes.status).toBe(200);
  const routesBody = (await routes.json()) as { routes: unknown[] };
  expect(Array.isArray(routesBody.routes)).toBe(true);
});

test("POST /api/router/providers without cookie → 401", async () => {
  const res = await fetch(`http://localhost:${port}/api/router/providers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "openrouter",
      base_url: "https://openrouter.ai/api/v1",
      api_key: "sk-or-live-secret-xyz",
      models: ["moonshotai/kimi-k2.5"],
    }),
  });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});

test("POST /api/router/providers with session cookie creates provider", async () => {
  const cookie = await login();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/models")) {
      return new Response(
        JSON.stringify({ object: "list", data: [{ id: "moonshotai/kimi-k2.5", object: "model" }] }),
        { status: 200 },
      );
    }
    return originalFetch(input, init);
  }) as unknown as typeof fetch;
  try {
    const res = await fetch(`http://localhost:${port}/api/router/providers`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "openrouter",
        base_url: "https://openrouter.ai/api/v1",
        api_key: "sk-or-live-secret-xyz",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: { name: string; base_url: string };
      models: Array<{ model_id: string }>;
    };
    expect(body.provider.name).toBe("openrouter");
    expect(body.provider.base_url).toBe("https://openrouter.ai/api/v1");
    expect(JSON.stringify(body)).not.toContain("sk-or-live-secret-xyz");
    expect(body.models.map((m) => m.model_id)).toEqual(["moonshotai/kimi-k2.5"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET /api/router/catalog without cookie → 401", async () => {
  const res = await fetch(`http://localhost:${port}/api/router/catalog`);
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "unauthorized" });
});

test("GET /api/router/catalog with session cookie → 200 items", async () => {
  const cookie = await login();
  const res = await fetch(`http://localhost:${port}/api/router/catalog`, { headers: { cookie } });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: Array<{ id: string; kind: string }> };
  expect(Array.isArray(body.items)).toBe(true);
});

test("PATCH /api/router/providers/:id and PUT /api/router/routes/:alias without cookie → 401", async () => {
  const patch = await fetch(`http://localhost:${port}/api/router/providers/1`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "disabled" }),
  });
  expect(patch.status).toBe(401);
  expect(await patch.json()).toEqual({ error: "unauthorized" });

  const put = await fetch(`http://localhost:${port}/api/router/routes/fast`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fallback_chain: [{ provider: "mock-local", model: "test-model" }] }),
  });
  expect(put.status).toBe(401);
  expect(await put.json()).toEqual({ error: "unauthorized" });
});

test("PATCH provider and PUT route with session cookie mutate router config", async () => {
  upsertProvider(db, { name: "mock-local", baseUrl: "http://localhost:18999/v1" });
  const provider = getProviderByName(db, "mock-local")!;
  addProviderModel(db, {
    providerId: provider.id,
    modelId: "test-model",
    capabilities: JSON.stringify(["chat"]),
    contextWindow: 4096,
  });
  upsertModelRoute(db, "fast", [{ provider: "mock-local", model: "test-model" }]);

  const cookie = await login();
  const patch = await fetch(`http://localhost:${port}/api/router/providers/${provider.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ status: "disabled" }),
  });
  expect(patch.status).toBe(200);
  const patchBody = (await patch.json()) as { provider: { status: string; name: string } };
  expect(patchBody.provider.status).toBe("disabled");
  expect(patchBody.provider.name).toBe("mock-local");

  const put = await fetch(`http://localhost:${port}/api/router/routes/fast`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fallback_chain: [{ provider: "mock-local", model: "test-model" }] }),
  });
  expect(put.status).toBe(200);
  const putBody = (await put.json()) as {
    route: { alias: string; fallback_chain: Array<{ provider: string; model: string }> };
  };
  expect(putBody.route.alias).toBe("fast");
  expect(putBody.route.fallback_chain).toEqual([{ provider: "mock-local", model: "test-model" }]);
});

test("POST /api/tasks accepts JWT session or agent Bearer key", async () => {
  const anon = await fetch(`http://localhost:${port}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ goal: "anon should fail" }),
  });
  expect(anon.status).toBe(401);

  const cookie = await login();
  const viaJwt = await fetch(`http://localhost:${port}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ goal: "from dashboard" }),
  });
  expect(viaJwt.status).toBe(200);
  const jwtBody = (await viaJwt.json()) as { task: { id: string; goal: string; status: string } };
  expect(jwtBody.task.goal).toBe("from dashboard");
  expect(jwtBody.task.status).toBe("open");

  const viaKey = await fetch(`http://localhost:${port}/api/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ goal: "from agent key" }),
  });
  expect(viaKey.status).toBe(200);
  const keyBody = (await viaKey.json()) as { task: { id: string; goal: string; created_by: string } };
  expect(keyBody.task.goal).toBe("from agent key");
  expect(keyBody.task.created_by).toBe("shinon");

  const listViaKey = await fetch(`http://localhost:${port}/api/tasks`, {
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  expect(listViaKey.status).toBe(200);
  const listed = (await listViaKey.json()) as { tasks: Array<{ id: string }> };
  expect(listed.tasks.some((t) => t.id === keyBody.task.id)).toBe(true);

  const claim = await fetch(`http://localhost:${port}/api/tasks/${keyBody.task.id}/claim`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ by: "shinon" }),
  });
  expect(claim.status).toBe(200);
  expect(((await claim.json()) as { task: { status: string; assigned_to: string } }).task).toMatchObject({
    status: "claimed",
    assigned_to: "shinon",
  });

  const complete = await fetch(`http://localhost:${port}/api/tasks/${keyBody.task.id}/complete`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ summary: "done via key" }),
  });
  expect(complete.status).toBe(200);
  expect(((await complete.json()) as { task: { status: string; summary: string } }).task).toMatchObject({
    status: "done",
    summary: "done via key",
  });
});

test("GET/POST /api/messages accepts JWT session or agent Bearer key", async () => {
  const anonPost = await fetch(`http://localhost:${port}/api/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from_agent: "shinon", to_agent: "localbot", type: "handoff" }),
  });
  expect(anonPost.status).toBe(401);

  const anonGet = await fetch(`http://localhost:${port}/api/messages?to_agent=shinon`);
  expect(anonGet.status).toBe(401);

  const cookie = await login();
  const viaJwt = await fetch(`http://localhost:${port}/api/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ from_agent: "shinon", to_agent: "localbot", type: "handoff" }),
  });
  expect(viaJwt.status).toBe(200);
  const jwtBody = (await viaJwt.json()) as { message: { id: string; to_agent: string } };
  expect(jwtBody.message.to_agent).toBe("localbot");

  const inboxJwt = await fetch(`http://localhost:${port}/api/messages?to_agent=localbot`, {
    headers: { cookie },
  });
  expect(inboxJwt.status).toBe(200);
  const jwtListed = (await inboxJwt.json()) as { messages: Array<{ id: string }> };
  expect(jwtListed.messages.some((m) => m.id === jwtBody.message.id)).toBe(true);

  const viaKey = await fetch(`http://localhost:${port}/api/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ from_agent: "shinon", to_agent: "shinon", type: "ping" }),
  });
  expect(viaKey.status).toBe(200);
  const keyBody = (await viaKey.json()) as { message: { id: string; type: string } };

  const inboxKey = await fetch(`http://localhost:${port}/api/messages?to_agent=shinon`, {
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  expect(inboxKey.status).toBe(200);
  const keyListed = (await inboxKey.json()) as { messages: Array<{ id: string; type: string }> };
  expect(keyListed.messages.some((m) => m.id === keyBody.message.id && m.type === "ping")).toBe(true);

  const markRead = await fetch(`http://localhost:${port}/api/messages/${keyBody.message.id}/read`, {
    method: "PUT",
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  expect(markRead.status).toBe(200);
  expect(((await markRead.json()) as { message: { read: number } }).message.read).toBe(1);

  const anonRead = await fetch(`http://localhost:${port}/api/messages/${keyBody.message.id}/read`, {
    method: "PUT",
  });
  expect(anonRead.status).toBe(401);
});

test("agent key cannot spoof sender or read another agent's mailbox", async () => {
  const cookie = await login();
  const secret = await fetch(`http://localhost:${port}/api/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ from_agent: "localbot", to_agent: "localbot", type: "secret" }),
  });
  expect(secret.status).toBe(200);
  const secretBody = (await secret.json()) as { message: { id: string; type: string } };
  const secretId = secretBody.message.id;

  const spoof = await fetch(`http://localhost:${port}/api/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ from_agent: "localbot", to_agent: "shinon", type: "spoof" }),
  });
  expect(spoof.status).toBe(200);
  const spoofBody = (await spoof.json()) as { message: { from_agent: string; to_agent: string } };
  expect(spoofBody.message.from_agent).toBe("shinon");

  const inboxKey = await fetch(`http://localhost:${port}/api/messages?to_agent=localbot`, {
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  expect(inboxKey.status).toBe(200);
  const keyListed = (await inboxKey.json()) as { messages: Array<{ id: string; type: string }> };
  expect(keyListed.messages.some((m) => m.id === secretId || m.type === "secret")).toBe(false);

  const stealRead = await fetch(`http://localhost:${port}/api/messages/${secretId}/read`, {
    method: "PUT",
    headers: { authorization: `Bearer ${TEST_KEY}` },
  });
  expect(stealRead.status).toBe(403);
  expect(await stealRead.json()).toEqual({ error: "forbidden" });

  const localInbox = await fetch(`http://localhost:${port}/api/messages?to_agent=shinon`, {
    headers: { authorization: `Bearer ${LOCAL_KEY}` },
  });
  expect(localInbox.status).toBe(200);
  const localListed = (await localInbox.json()) as { messages: Array<{ id: string; type: string; to_agent: string }> };
  expect(localListed.messages.some((m) => m.type === "ping" || m.type === "spoof")).toBe(false);

  const adminInbox = await fetch(`http://localhost:${port}/api/messages?to_agent=localbot`, {
    headers: { cookie },
  });
  expect(adminInbox.status).toBe(200);
  const adminListed = (await adminInbox.json()) as { messages: Array<{ id: string; type: string }> };
  expect(adminListed.messages.some((m) => m.id === secretId && m.type === "secret")).toBe(true);
});

test("agent key cannot spoof task created_by, claim as another agent, or complete another's task", async () => {
  const cookie = await login();

  const spoofCreate = await fetch(`http://localhost:${port}/api/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ goal: "spoof creator", created_by: "localbot" }),
  });
  expect(spoofCreate.status).toBe(200);
  const spoofCreateBody = (await spoofCreate.json()) as { task: { id: string; created_by: string } };
  expect(spoofCreateBody.task.created_by).toBe("shinon");

  const spoofClaim = await fetch(`http://localhost:${port}/api/tasks/${spoofCreateBody.task.id}/claim`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ by: "localbot" }),
  });
  expect(spoofClaim.status).toBe(200);
  const spoofClaimBody = (await spoofClaim.json()) as { task: { assigned_to: string } };
  expect(spoofClaimBody.task.assigned_to).toBe("shinon");

  const jwtTask = await fetch(`http://localhost:${port}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ goal: "dashboard task for localbot" }),
  });
  expect(jwtTask.status).toBe(200);
  const jwtTaskBody = (await jwtTask.json()) as { task: { id: string } };

  const localClaim = await fetch(`http://localhost:${port}/api/tasks/${jwtTaskBody.task.id}/claim`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${LOCAL_KEY}`,
    },
    body: JSON.stringify({ by: "localbot" }),
  });
  expect(localClaim.status).toBe(200);

  const stealComplete = await fetch(`http://localhost:${port}/api/tasks/${jwtTaskBody.task.id}/complete`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify({ summary: "stolen" }),
  });
  expect(stealComplete.status).toBe(403);
  expect(await stealComplete.json()).toEqual({ error: "forbidden" });

  const ownerComplete = await fetch(`http://localhost:${port}/api/tasks/${jwtTaskBody.task.id}/complete`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${LOCAL_KEY}`,
    },
    body: JSON.stringify({ summary: "mine" }),
  });
  expect(ownerComplete.status).toBe(200);
  expect(((await ownerComplete.json()) as { task: { status: string } }).task.status).toBe("done");

  const unclaimed = await fetch(`http://localhost:${port}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ goal: "dashboard completes unclaimed" }),
  });
  expect(unclaimed.status).toBe(200);
  const unclaimedBody = (await unclaimed.json()) as { task: { id: string } };

  const dashComplete = await fetch(`http://localhost:${port}/api/tasks/${unclaimedBody.task.id}/complete`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ summary: "admin done" }),
  });
  expect(dashComplete.status).toBe(200);
  expect(((await dashComplete.json()) as { task: { status: string } }).task.status).toBe("done");
});
