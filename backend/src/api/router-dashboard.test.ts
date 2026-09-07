import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  addProviderModel,
  createDb,
  getProviderByName,
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import { decryptSecret, encryptSecret } from "@cardinal/keys";
import {
  handleCreateRouterProvider,
  handleDeleteRouterProvider,
  handleListRouterProviders,
  handleListRouterRoutes,
  handlePatchRouterProvider,
  handlePutRouterRoute,
  handleSyncRouterProviderModels,
} from "./router-dashboard";

type ProviderPublic = {
  id: number;
  name: string;
  base_url: string;
  wire_format: "openai" | "anthropic" | "gemini";
  status: "active" | "disabled";
  rpm_limit: number | null;
  tpm_limit: number | null;
  cost_per_mtok: number;
  created_at: string;
};

type ModelPublic = {
  provider_id: number;
  model_id: string;
  capabilities: string;
  context_window: number | null;
};

type Hop = { provider: string; model: string };

type RoutePublic = {
  alias: string;
  fallback_chain: Hop[];
  created_at: string;
};

const POOL = "test-pool-secret";
const originalFetch = globalThis.fetch;
const DEFAULT_FETCH_MODELS = ["test-model", "moonshotai/kimi-k2.5"];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchModels(modelIds: string[] = DEFAULT_FETCH_MODELS): void {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ object: "list", data: modelIds.map((id) => ({ id, object: "model" })) }),
      { status: 200 },
    )) as typeof fetch;
}

function jsonReq(url: string, method: string, body: string): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

function seedRouter(db: Database): { mockId: number; deepseekId: number } {
  upsertProvider(db, { name: "deepseek", baseUrl: "https://api.deepseek.com/v1", costPerMtok: 0.14 });
  upsertProvider(db, {
    name: "mock-local",
    baseUrl: "http://localhost:18999/v1",
    apiKeyEnc: encryptSecret("secret-should-not-leak", POOL),
  });
  const deepseek = getProviderByName(db, "deepseek")!;
  const mock = getProviderByName(db, "mock-local")!;
  addProviderModel(db, {
    providerId: deepseek.id,
    modelId: "deepseek-chat",
    capabilities: JSON.stringify(["chat"]),
    contextWindow: 128000,
  });
  addProviderModel(db, {
    providerId: mock.id,
    modelId: "test-model",
    capabilities: JSON.stringify(["chat"]),
    contextWindow: 4096,
  });
  upsertModelRoute(db, "fast", [{ provider: "mock-local", model: "test-model" }]);
  return { mockId: mock.id, deepseekId: deepseek.id };
}

describe("handleListRouterProviders", () => {
  test("empty db → { providers: [], models: [] }", async () => {
    const db = createDb(":memory:");
    const res = handleListRouterProviders(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: [], models: [] });
    db.close();
  });

  test("lists providers ordered by name with sibling models", async () => {
    const db = createDb(":memory:");
    const { mockId, deepseekId } = seedRouter(db);

    const res = handleListRouterProviders(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: ProviderPublic[];
      models: ModelPublic[];
    };

    expect(body.providers.map((p) => p.name)).toEqual(["deepseek", "mock-local"]);
    expect(body.providers[0]).toMatchObject({
      id: deepseekId,
      name: "deepseek",
      base_url: "https://api.deepseek.com/v1",
      wire_format: "openai",
      status: "active",
      rpm_limit: null,
      tpm_limit: null,
      cost_per_mtok: 0.14,
    });
    expect(typeof body.providers[0]!.created_at).toBe("string");
    expect(body.providers[1]).toMatchObject({
      id: mockId,
      name: "mock-local",
      base_url: "http://localhost:18999/v1",
      wire_format: "openai",
      status: "active",
      cost_per_mtok: 0,
    });

    expect(body.models).toEqual([
      {
        provider_id: deepseekId,
        model_id: "deepseek-chat",
        capabilities: JSON.stringify(["chat"]),
        context_window: 128000,
      },
      {
        provider_id: mockId,
        model_id: "test-model",
        capabilities: JSON.stringify(["chat"]),
        context_window: 4096,
      },
    ]);
    db.close();
  });

  test("never leaks api_key_enc even when a provider was seeded with a secret", async () => {
    const db = createDb(":memory:");
    seedRouter(db);

    const res = handleListRouterProviders(db);
    expect(res.status).toBe(200);
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized.includes("secret-should-not-leak")).toBe(false);
    expect(serialized.includes("api_key_enc")).toBe(false);
    expect(serialized.includes("apiKeyEnc")).toBe(false);
    db.close();
  });
});

describe("handleListRouterRoutes", () => {
  test("empty db → { routes: [] }", async () => {
    const db = createDb(":memory:");
    const res = handleListRouterRoutes(db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ routes: [] });
    db.close();
  });

  test("lists alias + parsed fallback_chain hops + created_at, ordered by alias", async () => {
    const db = createDb(":memory:");
    upsertModelRoute(db, "pro", [
      { provider: "deepseek", model: "deepseek-chat" },
      { provider: "mock-local", model: "test-model" },
    ]);
    upsertModelRoute(db, "fast", [{ provider: "mock-local", model: "test-model" }]);

    const res = handleListRouterRoutes(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { routes: RoutePublic[] };
    expect(body.routes.map((r) => r.alias)).toEqual(["fast", "pro"]);
    expect(body.routes[0]!.fallback_chain).toEqual([{ provider: "mock-local", model: "test-model" }]);
    expect(body.routes[1]!.fallback_chain).toEqual([
      { provider: "deepseek", model: "deepseek-chat" },
      { provider: "mock-local", model: "test-model" },
    ]);
    expect(typeof body.routes[0]!.created_at).toBe("string");
    expect(typeof body.routes[1]!.created_at).toBe("string");
    db.close();
  });
});

describe("handlePatchRouterProvider", () => {
  test("PATCH active→disabled → 200 and subsequent list reflects it", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);

    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(`http://localhost/api/router/providers/${mockId}`, "PATCH", JSON.stringify({ status: "disabled" })),
      POOL,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: ProviderPublic; models: ModelPublic[] };
    expect(body.provider.id).toBe(mockId);
    expect(body.provider.name).toBe("mock-local");
    expect(body.provider.status).toBe("disabled");
    expect("api_key_enc" in body.provider).toBe(false);
    expect(body.models.some((m) => m.provider_id === mockId)).toBe(true);

    const listed = (await handleListRouterProviders(db).json()) as {
      providers: ProviderPublic[];
    };
    expect(listed.providers.find((p) => p.id === mockId)!.status).toBe("disabled");
    db.close();
  });

  test("unknown id → 404 not_found", async () => {
    const db = createDb(":memory:");
    seedRouter(db);
    const res = await handlePatchRouterProvider(
      db,
      "99999",
      jsonReq("http://localhost/api/router/providers/99999", "PATCH", JSON.stringify({ status: "disabled" })),
      POOL,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("non-numeric id → 400 invalid_id", async () => {
    const db = createDb(":memory:");
    const res = await handlePatchRouterProvider(
      db,
      "abc",
      jsonReq("http://localhost/api/router/providers/abc", "PATCH", JSON.stringify({ status: "disabled" })),
      POOL,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_id" });
    db.close();
  });

  test('status "nope" → 400 invalid_status', async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(`http://localhost/api/router/providers/${mockId}`, "PATCH", JSON.stringify({ status: "nope" })),
      POOL,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_status" });
    db.close();
  });

  test("invalid JSON body → 400 bad_request", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(`http://localhost/api/router/providers/${mockId}`, "PATCH", "not-json"),
      POOL,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("empty body → 400 invalid_payload", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(`http://localhost/api/router/providers/${mockId}`, "PATCH", JSON.stringify({})),
      POOL,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    db.close();
  });

  test("updates base_url, wire_format, cost without rotating api_key", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    const before = getProviderByName(db, "mock-local")!;
    mockFetchModels(["fetched-model"]);

    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(
        `http://localhost/api/router/providers/${mockId}`,
        "PATCH",
        JSON.stringify({
          base_url: "http://127.0.0.1:19999/v1",
          wire_format: "anthropic",
          cost_per_mtok: 0.42,
        }),
      ),
      POOL,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: ProviderPublic; models: ModelPublic[] };
    expect(body.provider.base_url).toBe("http://127.0.0.1:19999/v1");
    expect(body.provider.wire_format).toBe("anthropic");
    expect(body.provider.cost_per_mtok).toBe(0.42);
    expect(body.models.map((m) => m.model_id)).toEqual(["fetched-model"]);

    const after = getProviderByName(db, "mock-local")!;
    expect(after.api_key_enc).toBe(before.api_key_enc);
    db.close();
  });

  test("rotates api_key when provided", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    mockFetchModels(["test-model"]);
    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(
        `http://localhost/api/router/providers/${mockId}`,
        "PATCH",
        JSON.stringify({ api_key: "rotated-secret" }),
      ),
      POOL,
    );
    expect(res.status).toBe(200);
    const row = getProviderByName(db, "mock-local")!;
    expect(decryptSecret(row.api_key_enc!, POOL)).toBe("rotated-secret");
    expect(JSON.stringify(await res.json())).not.toContain("rotated-secret");
    db.close();
  });

  test("sync_models refetches from upstream", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    mockFetchModels(["alpha", "beta"]);
    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(
        `http://localhost/api/router/providers/${mockId}`,
        "PATCH",
        JSON.stringify({ sync_models: true }),
      ),
      POOL,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { models: ModelPublic[] };
    expect(body.models.map((m) => m.model_id)).toEqual(["alpha", "beta"]);
    db.close();
  });

  test("rejects manual models payload", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    const res = await handlePatchRouterProvider(
      db,
      String(mockId),
      jsonReq(
        `http://localhost/api/router/providers/${mockId}`,
        "PATCH",
        JSON.stringify({ models: ["only-one"] }),
      ),
      POOL,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    db.close();
  });
});

describe("handleSyncRouterProviderModels", () => {
  test("POST sync-models refetches catalog", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    mockFetchModels(["sync-a", "sync-b"]);
    const res = await handleSyncRouterProviderModels(db, String(mockId), POOL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { models: ModelPublic[] };
    expect(body.models.map((m) => m.model_id)).toEqual(["sync-a", "sync-b"]);
    db.close();
  });
});

describe("handleDeleteRouterProvider", () => {
  test("DELETE existing provider → 200 and list no longer includes it", async () => {
    const db = createDb(":memory:");
    const { mockId } = seedRouter(db);
    const res = handleDeleteRouterProvider(db, String(mockId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const listed = (await handleListRouterProviders(db).json()) as {
      providers: ProviderPublic[];
      models: ModelPublic[];
    };
    expect(listed.providers.some((p) => p.id === mockId)).toBe(false);
    expect(listed.models.some((m) => m.provider_id === mockId)).toBe(false);
    db.close();
  });

  test("unknown id → 404 not_found", async () => {
    const db = createDb(":memory:");
    seedRouter(db);
    const res = handleDeleteRouterProvider(db, "99999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("non-numeric id → 400 invalid_id", async () => {
    const db = createDb(":memory:");
    const res = handleDeleteRouterProvider(db, "abc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_id" });
    db.close();
  });
});

describe("handlePutRouterRoute", () => {
  test("PUT new alias + valid chain → 200 route with those hops; list includes it", async () => {
    const db = createDb(":memory:");
    const hops: Hop[] = [
      { provider: "mock-local", model: "test-model" },
      { provider: "deepseek", model: "deepseek-chat" },
    ];
    const res = await handlePutRouterRoute(
      db,
      "fast",
      jsonReq("http://localhost/api/router/routes/fast", "PUT", JSON.stringify({ fallback_chain: hops })),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { route: RoutePublic };
    expect(body.route.alias).toBe("fast");
    expect(body.route.fallback_chain).toEqual(hops);
    expect(typeof body.route.created_at).toBe("string");

    const listed = (await handleListRouterRoutes(db).json()) as { routes: RoutePublic[] };
    expect(listed.routes.some((r) => r.alias === "fast")).toBe(true);
    expect(listed.routes.find((r) => r.alias === "fast")!.fallback_chain).toEqual(hops);
    db.close();
  });

  test("PUT existing alias overwrites fallback_chain", async () => {
    const db = createDb(":memory:");
    upsertModelRoute(db, "fast", [{ provider: "mock-local", model: "old-model" }]);

    const hops: Hop[] = [{ provider: "deepseek", model: "deepseek-chat" }];
    const res = await handlePutRouterRoute(
      db,
      "fast",
      jsonReq("http://localhost/api/router/routes/fast", "PUT", JSON.stringify({ fallback_chain: hops })),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { route: RoutePublic };
    expect(body.route.alias).toBe("fast");
    expect(body.route.fallback_chain).toEqual(hops);

    const listed = (await handleListRouterRoutes(db).json()) as { routes: RoutePublic[] };
    expect(listed.routes).toHaveLength(1);
    expect(listed.routes[0]!.fallback_chain).toEqual(hops);
    db.close();
  });

  test("empty chain [] → 400 invalid_chain", async () => {
    const db = createDb(":memory:");
    const res = await handlePutRouterRoute(
      db,
      "fast",
      jsonReq("http://localhost/api/router/routes/fast", "PUT", JSON.stringify({ fallback_chain: [] })),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_chain" });
    db.close();
  });

  test("hop missing model → 400 invalid_chain", async () => {
    const db = createDb(":memory:");
    const res = await handlePutRouterRoute(
      db,
      "fast",
      jsonReq(
        "http://localhost/api/router/routes/fast",
        "PUT",
        JSON.stringify({ fallback_chain: [{ provider: "mock-local" }] }),
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_chain" });
    db.close();
  });

  test('empty alias "" or "   " → 400 invalid_alias', async () => {
    const db = createDb(":memory:");
    const hops = JSON.stringify({ fallback_chain: [{ provider: "mock-local", model: "test-model" }] });

    const empty = await handlePutRouterRoute(
      db,
      "",
      jsonReq("http://localhost/api/router/routes/", "PUT", hops),
    );
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "invalid_alias" });

    const blank = await handlePutRouterRoute(
      db,
      "   ",
      jsonReq("http://localhost/api/router/routes/%20%20%20", "PUT", hops),
    );
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: "invalid_alias" });
    db.close();
  });

  test("invalid JSON → 400 bad_request", async () => {
    const db = createDb(":memory:");
    const res = await handlePutRouterRoute(
      db,
      "fast",
      jsonReq("http://localhost/api/router/routes/fast", "PUT", "not-json"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("alias containing % does not throw URIError", async () => {
    const db = createDb(":memory:");
    const hops: Hop[] = [{ provider: "mock-local", model: "test-model" }];
    const res = await handlePutRouterRoute(
      db,
      "100%",
      jsonReq("http://localhost/api/router/routes/100%25", "PUT", JSON.stringify({ fallback_chain: hops })),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { route: RoutePublic };
    expect(body.route.alias).toBe("100%");
    expect(body.route.fallback_chain).toEqual(hops);
    db.close();
  });
});

describe("handleListRouterRoutes malformed chain", () => {
  test("corrupt fallback_chain JSON → 200 with empty hops", async () => {
    const db = createDb(":memory:");
    db.run("INSERT INTO model_routes (alias, fallback_chain) VALUES (?, ?)", ["broken", "not-json"]);
    const res = handleListRouterRoutes(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { routes: RoutePublic[] };
    expect(body.routes).toHaveLength(1);
    expect(body.routes[0]!.alias).toBe("broken");
    expect(body.routes[0]!.fallback_chain).toEqual([]);
    db.close();
  });

  test("skips invalid hops and keeps valid ones", async () => {
    const db = createDb(":memory:");
    db.run("INSERT INTO model_routes (alias, fallback_chain) VALUES (?, ?)", [
      "mixed",
      JSON.stringify([{ foo: 1 }, { provider: "mock-local", model: "test-model" }]),
    ]);
    const res = handleListRouterRoutes(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { routes: RoutePublic[] };
    expect(body.routes[0]!.fallback_chain).toEqual([{ provider: "mock-local", model: "test-model" }]);
    db.close();
  });
});

function createProviderBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    api_key: "sk-or-live-secret-xyz",
    ...overrides,
  });
}

describe("handleCreateRouterProvider", () => {
  test("creates provider, fetches models, encrypts api_key, never returns the secret", async () => {
    const db = createDb(":memory:");
    mockFetchModels(["moonshotai/kimi-k2.5"]);
    const plaintext = "sk-or-live-secret-xyz";
    const res = await handleCreateRouterProvider(
      db,
      jsonReq("http://localhost/api/router/providers", "POST", createProviderBody()),
      POOL,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: ProviderPublic;
      models: ModelPublic[];
    };
    expect(body.provider.name).toBe("openrouter");
    expect(body.provider.base_url).toBe("https://openrouter.ai/api/v1");
    expect(body.provider.wire_format).toBe("openai");
    expect(body.provider.status).toBe("active");
    expect(body.provider).not.toHaveProperty("api_key_enc");
    expect(body.provider).not.toHaveProperty("api_key");
    expect(JSON.stringify(body)).not.toContain(plaintext);
    expect(body.models).toEqual([
      expect.objectContaining({
        provider_id: body.provider.id,
        model_id: "moonshotai/kimi-k2.5",
      }),
    ]);

    const row = getProviderByName(db, "openrouter")!;
    expect(row.api_key_enc).not.toBe(plaintext);
    expect(row.api_key_enc).not.toBeNull();
    expect(decryptSecret(row.api_key_enc!, POOL)).toBe(plaintext);
    db.close();
  });

  test("rejects missing or empty required fields", async () => {
    const db = createDb(":memory:");
    const payloads = [
      createProviderBody({ name: "" }),
      createProviderBody({ base_url: "" }),
      createProviderBody({ api_key: "" }),
      "not-json",
    ];
    for (const body of payloads) {
      const res = await handleCreateRouterProvider(
        db,
        jsonReq("http://localhost/api/router/providers", "POST", body),
        POOL,
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_payload" });
    }
    db.close();
  });

  test("rejects invalid wire_format", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateRouterProvider(
      db,
      jsonReq(
        "http://localhost/api/router/providers",
        "POST",
        createProviderBody({ wire_format: "raw" }),
      ),
      POOL,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    db.close();
  });

  test("upserts by name, rotates key, and replaces fetched models", async () => {
    const db = createDb(":memory:");
    mockFetchModels(["moonshotai/kimi-k2.5"]);
    const first = await handleCreateRouterProvider(
      db,
      jsonReq(
        "http://localhost/api/router/providers",
        "POST",
        createProviderBody({ api_key: "key-one" }),
      ),
      POOL,
    );
    expect(first.status).toBe(200);
    mockFetchModels(["other"]);
    const second = await handleCreateRouterProvider(
      db,
      jsonReq(
        "http://localhost/api/router/providers",
        "POST",
        createProviderBody({ api_key: "key-two" }),
      ),
      POOL,
    );
    expect(second.status).toBe(200);
    const row = getProviderByName(db, "openrouter")!;
    expect(decryptSecret(row.api_key_enc!, POOL)).toBe("key-two");
    const listed = (await handleListRouterProviders(db).json()) as { models: ModelPublic[] };
    const ids = listed.models
      .filter((m) => m.provider_id === row.id)
      .map((m) => m.model_id)
      .sort();
    expect(ids).toEqual(["other"]);
    db.close();
  });

  test("rolls back provider when model fetch fails", async () => {
    const db = createDb(":memory:");
    globalThis.fetch = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    const res = await handleCreateRouterProvider(
      db,
      jsonReq("http://localhost/api/router/providers", "POST", createProviderBody()),
      POOL,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "model_fetch_failed", detail: "upstream 503" });
    const listed = (await handleListRouterProviders(db).json()) as { providers: ProviderPublic[] };
    expect(listed.providers).toHaveLength(0);
    db.close();
  });
});
