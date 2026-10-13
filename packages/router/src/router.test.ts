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
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";
import { routeCompletion, RouterError } from "./index";

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
const upstreamHits = new Map<string, number>();
const upstreamAuth = new Map<string, string | null>();

function upstreamPrefix(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

beforeAll(() => {
  mock = Bun.serve({
    hostname: "127.0.0.1",
    port: 18999,
    fetch(req) {
      const url = new URL(req.url);
      const prefix = upstreamPrefix(url.pathname);
      upstreamHits.set(prefix, (upstreamHits.get(prefix) ?? 0) + 1);
      upstreamAuth.set(prefix, req.headers.get("authorization"));
      if (url.pathname.startsWith("/a/")) {
        return Response.json(COMPLETION_OK);
      }
      if (url.pathname.startsWith("/b/")) {
        return new Response("rate limited", { status: 429 });
      }
      if (url.pathname.startsWith("/c/")) {
        return new Response("error", { status: 500 });
      }
      if (
        url.pathname.startsWith("/budget-block/") ||
        url.pathname.startsWith("/scope-deny/") ||
        url.pathname.startsWith("/no-key/") ||
        url.pathname.startsWith("/blank-key/")
      ) {
        return Response.json(COMPLETION_OK);
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

  test("a spent token budget is rejected before any upstream call", async () => {
    const db = createDb(":memory:");
    const base = `http://127.0.0.1:${mock.port}/budget-block`;
    seedProvider(db, "budget-block", base);
    upstreamHits.set("budget-block", 0);

    const atLimit = makeKey(db, { budgetLimit: 10, budgetUsed: 10 });
    await expectRouterError(
      () => routeCompletion(db, atLimit, baseRequest, { decryptKey }),
      "budget_exceeded",
    );

    const zeroLimit = makeKey(db, { budgetLimit: 0, budgetUsed: 0 });
    await expectRouterError(
      () => routeCompletion(db, zeroLimit, baseRequest, { decryptKey }),
      "budget_exceeded",
    );

    expect(upstreamHits.get("budget-block")).toBe(0);
    expect(listUsage(db)).toHaveLength(0);
    const atLimitRow = listKeys(db).find((row) => row.key_hash === atLimit);
    expect(atLimitRow).toBeDefined();
    expect(atLimitRow!.revoked_at).toBeNull();
    expect(atLimitRow!.budget_used).toBe(10);
    const zeroRow = listKeys(db).find((row) => row.key_hash === zeroLimit);
    expect(zeroRow).toBeDefined();
    expect(zeroRow!.revoked_at).toBeNull();
    expect(zeroRow!.budget_used).toBe(0);
    db.close();
  });

  test("model scope must match exactly; a prefix or glob-like scope does not authorize", async () => {
    const db = createDb(":memory:");
    const base = `http://127.0.0.1:${mock.port}/scope-deny`;
    seedProvider(db, "scope-deny", base);
    upstreamHits.set("scope-deny", 0);

    for (const scopes of [["test"], ["test-model*"], ["test-model-extra"]]) {
      const keyHash = makeKey(db, { scopes });
      await expectRouterError(
        () => routeCompletion(db, keyHash, baseRequest, { decryptKey }),
        "scope_denied",
      );
    }

    expect(upstreamHits.get("scope-deny")).toBe(0);
    expect(listUsage(db)).toHaveLength(0);

    const exact = makeKey(db, { scopes: ["test-model"] });
    const response = await routeCompletion(db, exact, baseRequest, { decryptKey });
    expect(response.status).toBe(200);
    expect(upstreamHits.get("scope-deny")).toBe(1);
    expect(listUsage(db)).toHaveLength(1);
    db.close();
  });

  test("a provider with a null or blank api key is called without Authorization", async () => {
    const db = createDb(":memory:");
    const origin = `http://127.0.0.1:${mock.port}`;
    seedProvider(db, "no-key", `${origin}/no-key`);
    upsertProvider(db, { name: "blank-key", baseUrl: `${origin}/blank-key`, apiKeyEnc: "" });
    const blank = getProviderByName(db, "blank-key");
    if (blank === null) throw new Error("blank-key missing");
    addProviderModel(db, { providerId: blank.id, modelId: "test-model" });
    upstreamAuth.set("no-key", "unset");
    upstreamAuth.set("blank-key", "unset");

    const keyHash = makeKey(db);
    const missing = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(missing.status).toBe(200);
    expect(upstreamAuth.get("no-key")).toBeNull();

    upsertProvider(db, { name: "no-key", baseUrl: "http://127.0.0.1:9/unused", status: "disabled" });
    const blankResponse = await routeCompletion(db, keyHash, baseRequest, { decryptKey });
    expect(blankResponse.status).toBe(200);
    expect(upstreamAuth.get("blank-key")).toBeNull();
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
});
