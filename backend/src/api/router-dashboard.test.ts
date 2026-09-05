import { describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  addProviderModel,
  createDb,
  getProviderByName,
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import {
  handleListRouterProviders,
  handleListRouterRoutes,
  handlePatchRouterProvider,
  handlePutRouterRoute,
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
    apiKeyEnc: "secret-should-not-leak",
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
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider: ProviderPublic };
    expect(body.provider.id).toBe(mockId);
    expect(body.provider.name).toBe("mock-local");
    expect(body.provider.status).toBe("disabled");
    expect("api_key_enc" in body.provider).toBe(false);

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
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
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
