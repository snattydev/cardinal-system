import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  addProviderModel,
  createAgentKey,
  createDb,
  findActiveKeyByHash,
  getProviderByName,
  listKeys,
  listUsage,
  registerAgent,
  setProviderStatus,
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";
import { routeCompletion, RouterError, type ProviderAttempt } from "./index";

const COMPLETION_OK = {
  choices: [{ message: { content: "ok" } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

const decryptKey = (enc: string): string => enc;

const baseRequest = {
  model: "test-model",
  messages: [{ role: "user", content: "hi" }],
};

let mock: ReturnType<typeof Bun.serve>;
let baseA = "";
let baseB = "";
let baseC = "";

beforeAll(() => {
  mock = Bun.serve({
    hostname: "127.0.0.1",
    port: 18999,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/a/")) {
        return Response.json(COMPLETION_OK);
      }
      if (url.pathname.startsWith("/b/")) {
        return new Response("rate limited", { status: 429 });
      }
      if (url.pathname.startsWith("/c/")) {
        return new Response("error", { status: 500 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  const origin = `http://127.0.0.1:${mock.port}`;
  baseA = `${origin}/a/v1`;
  baseB = `${origin}/b/v1`;
  baseC = `${origin}/c/v1`;
});

afterAll(() => {
  mock.stop(true);
});

function seedProvider(
  db: Database,
  name: string,
  baseUrl: string,
  modelId = "test-model",
  costPerMtok?: number,
): number {
  upsertProvider(db, { name, baseUrl, costPerMtok });
  const provider = getProviderByName(db, name);
  if (provider === null) throw new Error(`provider ${name} missing after upsert`);
  addProviderModel(db, { providerId: provider.id, modelId });
  return provider.id;
}

function makeKey(
  db: Database,
  opts: {
    scopes?: string[];
    budgetLimit?: number;
    budgetUsed?: number;
    expiresAt?: string;
    budgetUsdLimit?: number;
    budgetUsdUsed?: number;
  } = {},
): string {
  registerAgent(db, "router-agent", "agent");
  const keyHash = hashKey(generateKey());
  createAgentKey(db, {
    keyHash,
    agentName: "router-agent",
    scopes: opts.scopes,
    budgetLimit: opts.budgetLimit,
    expiresAt: opts.expiresAt,
    budgetUsdLimit: opts.budgetUsdLimit,
  });
  if (opts.budgetUsed !== undefined) {
    db.run("UPDATE agent_keys SET budget_used = ? WHERE key_hash = ?", [opts.budgetUsed, keyHash]);
  }
  if (opts.budgetUsdUsed !== undefined) {
    db.run("UPDATE agent_keys SET budget_usd_used = ? WHERE key_hash = ?", [opts.budgetUsdUsed, keyHash]);
  }
  return keyHash;
}

function attemptsOf(error: RouterError): ProviderAttempt[] {
  const attempts = error.details?.attempts;
  if (!Array.isArray(attempts)) throw new Error("missing attempts");
  return attempts as ProviderAttempt[];
}

function estimatedTokens(body: string): number {
  return Math.max(1, Math.ceil(body.length / 4));
}

async function expectRouterError(fn: () => Promise<unknown>, code: string): Promise<RouterError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(RouterError);
    const error = err as RouterError;
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected RouterError('${code}')`);
}

describe("routeCompletion", () => {
  test("autorouter falls back from 429 to a healthy provider and meters 15 tokens", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "ar-b", baseB);
    seedProvider(db, "ar-a", baseA);
    const keyHash = makeKey(db);

    const response = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    expect(json.choices[0].message.content).toBe("ok");

    const key = findActiveKeyByHash(db, keyHash);
    expect(key).not.toBeNull();
    expect(key!.budget_used).toBe(15);

    const usage = listUsage(db);
    expect(usage).toHaveLength(1);
    expect(usage[0].provider_name).toBe("ar-a");
    expect(usage[0].model_id).toBe("test-model");
    expect(usage[0].prompt_tokens).toBe(10);
    expect(usage[0].completion_tokens).toBe(5);
    expect(usage[0].total_tokens).toBe(15);
    db.close();
  });

  test("failover of only 429 and 500 providers throws all_providers_failed with attempts", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "fo-b", baseB);
    seedProvider(db, "fo-c", baseC);
    const keyHash = makeKey(db);

    const error = await expectRouterError(
      () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
      "all_providers_failed",
    );
    const attempts = error.details?.attempts;
    expect(Array.isArray(attempts)).toBe(true);
    expect((attempts as unknown[]).length).toBeGreaterThanOrEqual(2);
    db.close();
  });

  test("alias fast uses the first healthy hop in the fallback chain", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "al-a", baseA);
    seedProvider(db, "al-b", baseB);
    upsertModelRoute(db, "fast", [
      { provider: "al-a", model: "test-model" },
      { provider: "al-b", model: "test-model" },
    ]);
    const keyHash = makeKey(db);

    const response = await routeCompletion(
      db,
      keyHash,
      { ...baseRequest, model: "fast" },
      { decryptKey },
    );
    expect(response.status).toBe(200);
    const usage = listUsage(db);
    expect(usage).toHaveLength(1);
    expect(usage[0].provider_name).toBe("al-a");
    db.close();
  });

  test("scope_denied when the key cannot request the model", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "sc-a", baseA);
    const keyHash = makeKey(db, { scopes: ["other"] });

    await expectRouterError(
      () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
      "scope_denied",
    );
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("budget overshoot revokes the key after a successful upstream call", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "bu-a", baseA);
    const keyHash = makeKey(db, { budgetLimit: 10, budgetUsed: 8 });

    const response = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(response.status).toBe(200);

    expect(findActiveKeyByHash(db, keyHash)).toBeNull();
    const stored = listKeys(db).find((row) => row.key_hash === keyHash);
    expect(stored).toBeDefined();
    expect(stored!.revoked_at).not.toBeNull();
    expect(stored!.budget_used).toBe(8);
    db.close();
  });

  test("unauthorized when the key hash is unknown", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "un-a", baseA);

    await expectRouterError(
      () => routeCompletion(db, hashKey(generateKey()), baseRequest, { decryptKey }),
      "unauthorized",
    );
    db.close();
  });

  test("expired key (expires_at in the past) → unauthorized and no usage", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "exp-a", baseA);
    const keyHash = makeKey(db, { expiresAt: "1999-01-01T00:00:00Z" });

    await expectRouterError(
      () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
      "unauthorized",
    );
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("budget_usd_limit already spent → budget_exceeded before upstream", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "busd-a", baseA, "test-model", 2);
    const keyHash = makeKey(db, { budgetUsdLimit: 1, budgetUsdUsed: 1 });

    await expectRouterError(
      () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
      "budget_exceeded",
    );
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("USD budget overshoot revokes the key after a successful upstream call", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "busd-over-a", baseA, "test-model", 1_000_000);
    const keyHash = makeKey(db, { budgetUsdLimit: 1 });

    const response = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(response.status).toBe(200);

    expect(findActiveKeyByHash(db, keyHash)).toBeNull();
    const stored = listKeys(db).find((row) => row.key_hash === keyHash);
    expect(stored).toBeDefined();
    expect(stored!.revoked_at).not.toBeNull();
    expect(stored!.budget_usd_used).toBe(0);
    db.close();
  });

  test("meters USD from hop cost_per_mtok when budget_usd_limit is set", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "usd-a", baseA, "test-model", 2);
    const keyHash = makeKey(db, { budgetUsdLimit: 1 });

    const response = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(response.status).toBe(200);

    const key = findActiveKeyByHash(db, keyHash);
    expect(key).not.toBeNull();
    expect(key!.budget_used).toBe(15);
    expect(key!.budget_usd_used).toBeCloseTo((15 / 1e6) * 2, 8);
    db.close();
  });

  test("cost_per_mtok 0 with budgetUsdLimit set → 200 and budget_usd_used stays 0", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "usd0-a", baseA);
    const keyHash = makeKey(db, { budgetUsdLimit: 1 });

    const response = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(response.status).toBe(200);

    const key = findActiveKeyByHash(db, keyHash);
    expect(key).not.toBeNull();
    expect(key!.budget_usd_used).toBe(0);
    db.close();
  });

  test("no budget_usd_limit with provider cost → 200 and budget_usd_used stays 0", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "usdnl-a", baseA, "test-model", 2);
    const keyHash = makeKey(db);

    const response = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(response.status).toBe(200);

    const key = findActiveKeyByHash(db, keyHash);
    expect(key).not.toBeNull();
    expect(key!.budget_usd_used).toBe(0);
    db.close();
  });

  test("a 429 cools that provider down so the next request skips it", async () => {
    let limitedHits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path.startsWith("/limited/")) {
          limitedHits += 1;
          return new Response("rate limited", { status: 429 });
        }
        return Response.json(COMPLETION_OK);
      },
    });

    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const db = createDb(":memory:");
      seedProvider(db, "gap-429", `${origin}/limited/v1`);
      seedProvider(db, "gap-429-ok", `${origin}/ok/v1`);
      const keyHash = makeKey(db);

      const first = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
      expect(first.status).toBe(200);
      expect(limitedHits).toBe(1);
      expect(listUsage(db).map((row) => row.provider_name)).toEqual(["gap-429-ok"]);

      const second = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
      expect(second.status).toBe(200);
      expect(limitedHits).toBe(1);
      expect(listUsage(db)).toHaveLength(2);
      db.close();
    } finally {
      server.stop(true);
    }
  });

  test("a failed upstream fetch is a timeout attempt and the next call skips that provider", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "gap-dead", "http://127.0.0.1:99999/v1");
    const keyHash = makeKey(db);

    const first = await expectRouterError(
      () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
      "all_providers_failed",
    );
    const firstAttempts = attemptsOf(first);
    expect(firstAttempts).toHaveLength(1);
    expect(firstAttempts[0]).toMatchObject({ provider: "gap-dead", status: "timeout" });
    expect(firstAttempts[0]?.error).toEqual(expect.any(String));
    expect(firstAttempts[0]?.error).not.toContain("sk-");

    const second = await expectRouterError(
      () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
      "all_providers_failed",
    );
    expect(attemptsOf(second)).toEqual([{ provider: "gap-dead", status: "skipped" }]);
    db.close();
  });

  test("a client 400 does not cool the provider down", async () => {
    let hits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        hits += 1;
        return new Response("bad request", { status: 400 });
      },
    });

    try {
      const db = createDb(":memory:");
      seedProvider(db, "gap-400", `http://127.0.0.1:${server.port}/v1`);
      const keyHash = makeKey(db);

      const first = await expectRouterError(
        () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
        "all_providers_failed",
      );
      expect(attemptsOf(first)).toEqual([{ provider: "gap-400", status: 400 }]);

      const second = await expectRouterError(
        () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
        "all_providers_failed",
      );
      expect(attemptsOf(second)).toEqual([{ provider: "gap-400", status: 400 }]);
      expect(hits).toBe(2);
      db.close();
    } finally {
      server.stop(true);
    }
  });

  test("stops after three upstream attempts even when more hops remain", async () => {
    let hits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        hits += 1;
        return new Response("nope", { status: 400 });
      },
    });

    try {
      const db = createDb(":memory:");
      const baseUrl = `http://127.0.0.1:${server.port}/v1`;
      for (const name of ["gap-max-1", "gap-max-2", "gap-max-3", "gap-max-4"]) {
        seedProvider(db, name, baseUrl);
      }
      const keyHash = makeKey(db);

      const error = await expectRouterError(
        () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
        "all_providers_failed",
      );
      expect(attemptsOf(error).map((attempt) => attempt.provider)).toEqual([
        "gap-max-1",
        "gap-max-2",
        "gap-max-3",
      ]);
      expect(hits).toBe(3);
      db.close();
    } finally {
      server.stop(true);
    }
  });

  test("streams a JSON body through unchanged and meters its usage", async () => {
    const payload = JSON.stringify({
      model: "upstream-model",
      choices: [{ delta: { content: "hi" } }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    });
    let seen: unknown;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        seen = await req.json();
        return new Response(payload, { headers: { "content-type": "text/event-stream" } });
      },
    });

    try {
      const db = createDb(":memory:");
      seedProvider(db, "gap-stream", `http://127.0.0.1:${server.port}/v1`, "hop-model");
      upsertModelRoute(db, "gap-alias", [{ provider: "gap-stream", model: "hop-model" }]);
      const keyHash = makeKey(db, { scopes: ["gap-alias"] });
      const tools = [{ type: "function", function: { name: "ping" } }];

      const response = await routeCompletion(
        db,
        keyHash,
        { ...baseRequest, model: "gap-alias", stream: true, tools, temperature: 0, max_tokens: 16 },
        { decryptKey },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(await response.text()).toBe(payload);
      expect(seen).toEqual({
        model: "hop-model",
        messages: baseRequest.messages,
        stream: true,
        tools,
        temperature: 0,
        max_tokens: 16,
      });

      const key = findActiveKeyByHash(db, keyHash);
      expect(key?.budget_used).toBe(7);
      const usage = listUsage(db);
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({
        provider_name: "gap-stream",
        model_id: "hop-model",
        prompt_tokens: 4,
        completion_tokens: 3,
        total_tokens: 7,
      });
      db.close();
    } finally {
      server.stop(true);
    }
  });

  test("a stream without usage is metered from its length, and an empty stream meters 1", async () => {
    const plain = "abcdefghijkl";
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path.startsWith("/empty/")) return new Response("");
        return new Response(plain);
      },
    });

    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const db = createDb(":memory:");
      seedProvider(db, "gap-stream-len", `${origin}/plain/v1`);
      const lengthKey = makeKey(db);
      const lengthResponse = await routeCompletion(
        db,
        lengthKey,
        { ...baseRequest, stream: true },
        { decryptKey },
      );
      expect(await lengthResponse.text()).toBe(plain);
      expect(findActiveKeyByHash(db, lengthKey)?.budget_used).toBe(estimatedTokens(plain));

      seedProvider(db, "gap-stream-empty", `${origin}/empty/v1`, "empty-model");
      const emptyKey = makeKey(db);
      const emptyResponse = await routeCompletion(
        db,
        emptyKey,
        { ...baseRequest, model: "empty-model", stream: true },
        { decryptKey },
      );
      expect(await emptyResponse.text()).toBe("");
      expect(findActiveKeyByHash(db, emptyKey)?.budget_used).toBe(1);
      db.close();
    } finally {
      server.stop(true);
    }
  });

  test("a 200 body that reports zero tokens or is not JSON is still metered", async () => {
    const zeroUsage = JSON.stringify({
      model: "hop-model",
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      choices: [{ message: { content: "nope" } }],
    });
    const plain = "not-json-body!!";
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path.startsWith("/plain/")) return new Response(plain);
        return new Response(zeroUsage, { headers: { "content-type": "application/json" } });
      },
    });

    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const db = createDb(":memory:");
      seedProvider(db, "gap-zero", `${origin}/zero/v1`, "hop-model");
      upsertModelRoute(db, "gap-zero-alias", [{ provider: "gap-zero", model: "hop-model" }]);
      const zeroKey = makeKey(db, { scopes: ["gap-zero-alias"] });
      const zeroResponse = await routeCompletion(
        db,
        zeroKey,
        { ...baseRequest, model: "gap-zero-alias" },
        { decryptKey },
      );
      const zeroJson = (await zeroResponse.json()) as { model: string };
      expect(zeroJson.model).toBe("gap-zero-alias");
      expect(findActiveKeyByHash(db, zeroKey)?.budget_used).toBe(estimatedTokens(zeroUsage));

      seedProvider(db, "gap-plain", `${origin}/plain/v1`, "plain-model");
      const plainKey = makeKey(db);
      const plainResponse = await routeCompletion(
        db,
        plainKey,
        { ...baseRequest, model: "plain-model" },
        { decryptKey },
      );
      expect(await plainResponse.text()).toBe(plain);
      expect(findActiveKeyByHash(db, plainKey)?.budget_used).toBe(estimatedTokens(plain));
      db.close();
    } finally {
      server.stop(true);
    }
  });

  test("scopes that are not a string array fail closed", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "gap-scope", baseA);

    const corruptKey = makeKey(db, { scopes: ["test-model"] });
    db.run("UPDATE agent_keys SET scopes = ? WHERE key_hash = ?", ["not-json", corruptKey]);
    await expectRouterError(
      () => routeCompletion(db, corruptKey, baseRequest, { decryptKey }),
      "scope_denied",
    );

    const objectKey = makeKey(db, { scopes: ["test-model"] });
    db.run("UPDATE agent_keys SET scopes = ? WHERE key_hash = ?", [
      JSON.stringify({ model: "test-model" }),
      objectKey,
    ]);
    await expectRouterError(
      () => routeCompletion(db, objectKey, baseRequest, { decryptKey }),
      "scope_denied",
    );

    const mixedKey = makeKey(db, { scopes: ["other"] });
    db.run("UPDATE agent_keys SET scopes = ? WHERE key_hash = ?", [
      JSON.stringify(["other", 1, null, "test-model"]),
      mixedKey,
    ]);
    const response = await routeCompletion(db, mixedKey, baseRequest, { decryptKey });
    expect(response.status).toBe(200);
    expect(listUsage(db)).toHaveLength(1);
    db.close();
  });

  test("skips disabled providers, empty base URLs, and unusable fallback hops", async () => {
    let offHits = 0;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path.startsWith("/off/")) {
          offHits += 1;
          return new Response("should not be called", { status: 500 });
        }
        return Response.json(COMPLETION_OK);
      },
    });

    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const db = createDb(":memory:");
      seedProvider(db, "gap-off", `${origin}/off/v1`);
      seedProvider(db, "gap-on", `${origin}/on/v1`);
      setProviderStatus(db, "gap-off", "disabled");
      const autoKey = makeKey(db);
      const autoResponse = await routeCompletion(db, autoKey, baseRequest, { decryptKey });
      expect(autoResponse.status).toBe(200);
      expect(offHits).toBe(0);
      expect(listUsage(db).map((row) => row.provider_name)).toEqual(["gap-on"]);

      seedProvider(db, "gap-empty", `${origin}/on/v1`, "empty-model");
      db.run("UPDATE providers SET base_url = '' WHERE name = ?", ["gap-empty"]);
      const emptyKey = makeKey(db);
      await expectRouterError(
        () => routeCompletion(db, emptyKey, { ...baseRequest, model: "empty-model" }, { decryptKey }),
        "model_not_found",
      );

      seedProvider(db, "gap-chain-on", `${origin}/on/v1`, "kept-model");
      upsertModelRoute(db, "gap-chain", [
        { provider: "gap-off", model: "test-model" },
        { provider: "missing-provider", model: "test-model" },
        { provider: "gap-chain-on", model: "kept-model" },
      ]);
      db.run("UPDATE model_routes SET fallback_chain = ? WHERE alias = ?", [
        JSON.stringify([
          null,
          "bad",
          { provider: "gap-chain-on" },
          { provider: "gap-off", model: "test-model" },
          { provider: "gap-chain-on", model: "kept-model" },
        ]),
        "gap-chain",
      ]);
      const chainKey = makeKey(db, { scopes: ["gap-chain"] });
      const chainResponse = await routeCompletion(
        db,
        chainKey,
        { ...baseRequest, model: "gap-chain" },
        { decryptKey },
      );
      expect(chainResponse.status).toBe(200);
      expect(listUsage(db).filter((row) => row.model_id === "kept-model")).toHaveLength(1);
      expect(offHits).toBe(0);

      db.run("UPDATE model_routes SET fallback_chain = ? WHERE alias = ?", ["{not-json", "gap-chain"]);
      const corruptKey = makeKey(db, { scopes: ["gap-chain"] });
      await expectRouterError(
        () => routeCompletion(db, corruptKey, { ...baseRequest, model: "gap-chain" }, { decryptKey }),
        "model_not_found",
      );
      db.close();
    } finally {
      server.stop(true);
    }
  });
});
