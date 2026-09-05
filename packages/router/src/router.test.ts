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
});
