import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import type { Config } from "@cardinal/core";
import {
  addProviderModel,
  createAgentKey,
  createDb,
  getProviderByName,
  registerAgent,
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import { encryptSecret, generateKey, hashKey } from "@cardinal/keys";
import { extractBearerKey, handleChatCompletions, handleListModels } from "./router";

const COMPLETION_OK = {
  choices: [{ message: { content: "ok" } }],
  usage: { prompt_tokens: 5, completion_tokens: 3 },
};

const config: Config = {
  port: 0,
  dbPath: ":memory:",
  adminUser: "admin",
  adminPasswordHash: "unused",
  jwtSecret: "test-secret",
  staticDir: "/nonexistent",
  pingIntervalMs: 10_000,
  poolSecret: "test-pool-secret",
};

let mock: ReturnType<typeof Bun.serve>;
let mockOrigin = "";
let lastUpstream: { authorization: string | null; body: string } | null = null;

beforeAll(() => {
  mock = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/v1/chat/completions") {
        lastUpstream = {
          authorization: req.headers.get("authorization"),
          body: await req.text(),
        };
        return Response.json(COMPLETION_OK);
      }
      return new Response("error", { status: 500 });
    },
  });
  mockOrigin = `http://127.0.0.1:${mock.port}`;
});

afterAll(() => {
  mock.stop(true);
});

function seedProvider(db: Database, name: string, baseUrl: string, modelId = "test-model"): void {
  upsertProvider(db, { name, baseUrl });
  const provider = getProviderByName(db, name);
  if (provider === null) throw new Error(`provider ${name} missing after upsert`);
  addProviderModel(db, { providerId: provider.id, modelId });
}

function makeRawKey(
  db: Database,
  opts: { scopes?: string[]; budgetLimit?: number; budgetUsed?: number; agentName?: string } = {},
): string {
  const agentName = opts.agentName ?? "router-http-agent";
  registerAgent(db, agentName, "agent");
  const key = generateKey();
  createAgentKey(db, {
    keyHash: hashKey(key),
    agentName,
    scopes: opts.scopes,
    budgetLimit: opts.budgetLimit,
  });
  if (opts.budgetUsed !== undefined) {
    db.run("UPDATE agent_keys SET budget_used = ? WHERE key_hash = ?", [opts.budgetUsed, hashKey(key)]);
  }
  return key;
}

function completionReq(key: string | null, body: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) headers.authorization = `Bearer ${key}`;
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers,
    body,
  });
}

describe("extractBearerKey", () => {
  test("returns the raw key from a valid Bearer header", () => {
    const key = generateKey();
    const req = new Request("http://localhost/", { headers: { authorization: `Bearer ${key}` } });
    expect(extractBearerKey(req)).toBe(key);
  });

  test("returns null when the Authorization header is missing", () => {
    expect(extractBearerKey(new Request("http://localhost/"))).toBeNull();
  });

  test("returns null for a non-Bearer scheme", () => {
    const req = new Request("http://localhost/", { headers: { authorization: "Basic abc" } });
    expect(extractBearerKey(req)).toBeNull();
  });

  test("returns null when the key is not sk-cardinal-* format", () => {
    const req = new Request("http://localhost/", { headers: { authorization: "Bearer sk-cardinal-short" } });
    expect(extractBearerKey(req)).toBeNull();
  });

  test("accepts any bearer scheme casing", () => {
    const key = generateKey();
    const req = new Request("http://localhost/", { headers: { authorization: `bearer ${key}` } });
    expect(extractBearerKey(req)).toBe(key);
  });

  test("rejects a bearer header with trailing tokens", () => {
    const key = generateKey();
    const req = new Request("http://localhost/", { headers: { authorization: `Bearer ${key} extra` } });
    expect(extractBearerKey(req)).toBeNull();
  });
});

describe("handleChatCompletions", () => {
  test("sin Bearer → 401 unauthorized", async () => {
    const db = createDb(":memory:");
    const res = await handleChatCompletions(completionReq(null, JSON.stringify({ model: "test-model" })), db, config);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    db.close();
  });

  test("key inválida → 401 unauthorized", async () => {
    const db = createDb(":memory:");
    const res = await handleChatCompletions(
      completionReq("sk-cardinal-not-a-real-key", JSON.stringify({ model: "test-model" })),
      db,
      config,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    db.close();
  });

  test("unknown key with valid format → 401 unauthorized", async () => {
    const db = createDb(":memory:");
    const res = await handleChatCompletions(
      completionReq(generateKey(), JSON.stringify({ model: "test-model", messages: [] })),
      db,
      config,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    db.close();
  });

  test("invalid JSON body → 400 invalid_json", async () => {
    const db = createDb(":memory:");
    const key = makeRawKey(db);
    const res = await handleChatCompletions(completionReq(key, "not-json"), db, config);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
    db.close();
  });

  test("scope_denied → 403", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "http-scope", mockOrigin);
    const key = makeRawKey(db, { scopes: ["other"] });
    const res = await handleChatCompletions(
      completionReq(key, JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] })),
      db,
      config,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "scope_denied" });
    db.close();
  });

  test("model_not_found → 404", async () => {
    const db = createDb(":memory:");
    const key = makeRawKey(db);
    const res = await handleChatCompletions(
      completionReq(key, JSON.stringify({ model: "does-not-exist", messages: [{ role: "user", content: "hi" }] })),
      db,
      config,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "model_not_found" });
    db.close();
  });

  test("budget_exceeded → 402", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "http-budget", mockOrigin);
    const key = makeRawKey(db, { budgetLimit: 10, budgetUsed: 10 });
    const res = await handleChatCompletions(
      completionReq(key, JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] })),
      db,
      config,
    );
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "budget_exceeded" });
    db.close();
  });

  test("all_providers_failed → 502 with attempt details", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "http-fail", `${mockOrigin}/broken`);
    const key = makeRawKey(db);
    const res = await handleChatCompletions(
      completionReq(key, JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] })),
      db,
      config,
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; details: { attempts: unknown[] } };
    expect(body.error).toBe("all_providers_failed");
    expect(Array.isArray(body.details.attempts)).toBe(true);
    expect(body.details.attempts.length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  test("éxito con mock → 200 y body JSON con choices", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "http-ok", mockOrigin);
    const key = makeRawKey(db);
    const res = await handleChatCompletions(
      completionReq(key, JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] })),
      db,
      config,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    expect(body.choices[0]?.message.content).toBe("ok");
    db.close();
  });

  test("sends the provider key upstream and never the caller key", async () => {
    const db = createDb(":memory:");
    const providerSecret = "provider-live-secret";
    upsertProvider(db, {
      name: "http-keyed",
      baseUrl: mockOrigin,
      apiKeyEnc: encryptSecret(providerSecret, config.poolSecret),
    });
    const provider = getProviderByName(db, "http-keyed");
    if (provider === null) throw new Error("keyed provider missing");
    addProviderModel(db, { providerId: provider.id, modelId: "test-model" });
    const key = makeRawKey(db);
    lastUpstream = null;

    const res = await handleChatCompletions(
      completionReq(key, JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] })),
      db,
      config,
    );
    expect(res.status).toBe(200);
    expect(lastUpstream?.authorization).toBe(`Bearer ${providerSecret}`);
    expect(lastUpstream?.authorization).not.toContain(key);
    expect(lastUpstream?.body ?? "").not.toContain(key);
    db.close();
  });

  test("drops non-boolean stream and non-array messages, and keeps zero sampling limits", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "http-shape", mockOrigin);
    const key = makeRawKey(db);
    lastUpstream = null;

    const res = await handleChatCompletions(
      completionReq(
        key,
        JSON.stringify({
          model: "test-model",
          messages: "not-an-array",
          stream: "true",
          temperature: 0,
          max_tokens: 0,
          tools: "not-tools",
        }),
      ),
      db,
      config,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const sent = JSON.parse(lastUpstream?.body ?? "{}") as Record<string, unknown>;
    expect(sent).toEqual({
      model: "test-model",
      messages: [],
      temperature: 0,
      max_tokens: 0,
    });
    const body = (await res.json()) as { choices: unknown[] };
    expect(Array.isArray(body.choices)).toBe(true);
    db.close();
  });
});

describe("handleListModels", () => {
  test("lista modelos del provider activo y alias de model_routes", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "http-list", mockOrigin, "test-model");
    upsertProvider(db, { name: "http-off", baseUrl: mockOrigin, status: "disabled" });
    const off = getProviderByName(db, "http-off");
    if (off === null) throw new Error("disabled provider missing");
    addProviderModel(db, { providerId: off.id, modelId: "hidden-model" });
    upsertModelRoute(db, "fast", [{ provider: "http-list", model: "test-model" }]);

    const res = handleListModels(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      object: string;
      data: Array<{ id: string; object: string; owned_by: string }>;
    };
    expect(body.object).toBe("list");
    expect(body.data).toEqual(
      expect.arrayContaining([
        { id: "test-model", object: "model", owned_by: "http-list" },
        { id: "fast", object: "model", owned_by: "cardinal" },
      ]),
    );
    expect(body.data.find((m) => m.id === "hidden-model")).toBeUndefined();
    db.close();
  });
});
