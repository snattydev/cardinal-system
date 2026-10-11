/**
 * Fusion / Mixture of Agents config lives in model_routes.fallback_chain.
 * Arrays remain sequential failover. A JSON object with mode "fusion" triggers
 * parallel panel fan-out + judge synthesis:
 *
 * {
 *   "mode": "fusion",
 *   "panel": [
 *     { "provider": "p1", "model": "m1" },
 *     { "provider": "p2", "model": "m2" }
 *   ],
 *   "judge": { "provider": "judge-p", "model": "judge-m" },
 *   "strategy": "synthesize"
 * }
 *
 * panel items MAY be string model ids; judge MAY be a string model id.
 * Tests prefer hop objects so mock providers are explicit.
 *
 * strategy "synthesize" is v1. strategy "best_of" is unsupported (501).
 * Fusion v1 does not stream.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  addProviderModel,
  createAgentKey,
  createDb,
  findActiveKeyByHash,
  getProviderByName,
  listUsage,
  registerAgent,
  setProviderStatus,
  upsertProvider,
} from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";
import { routeCompletion, RouterError } from "./index";

const PROPOSER_ONE = {
  choices: [{ message: { role: "assistant", content: "draft-one" } }],
  usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
  model: "m1",
};

const PROPOSER_TWO = {
  choices: [{ message: { role: "assistant", content: "draft-two" } }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  model: "m2",
};

const JUDGE_COMPLETION = {
  id: "chatcmpl-judge",
  object: "chat.completion",
  choices: [{ index: 0, message: { role: "assistant", content: "fused" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
  model: "judge-upstream-model",
};

const decryptKey = (enc: string): string => enc;

const fusionRequest = {
  model: "fusion",
  messages: [{ role: "user", content: "hi" }],
};

let mock: ReturnType<typeof Bun.serve>;
let baseP1 = "";
let baseP2 = "";
let baseJudge = "";
let baseFail = "";

let p1Calls = 0;
let p2Calls = 0;
let judgeCalls = 0;
let failCalls = 0;
let lastJudgeBody = "";

function resetMockState(): void {
  p1Calls = 0;
  p2Calls = 0;
  judgeCalls = 0;
  failCalls = 0;
  lastJudgeBody = "";
}

beforeAll(() => {
  mock = Bun.serve({
    hostname: "127.0.0.1",
    port: 18998,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/p1/")) {
        p1Calls += 1;
        return Response.json(PROPOSER_ONE);
      }
      if (url.pathname.startsWith("/p2/")) {
        p2Calls += 1;
        return Response.json(PROPOSER_TWO);
      }
      if (url.pathname.startsWith("/judge/")) {
        judgeCalls += 1;
        lastJudgeBody = await req.text();
        return Response.json(JUDGE_COMPLETION);
      }
      if (url.pathname.startsWith("/fail/")) {
        failCalls += 1;
        return new Response("error", { status: 500 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  const origin = `http://127.0.0.1:${mock.port}`;
  baseP1 = `${origin}/p1/v1`;
  baseP2 = `${origin}/p2/v1`;
  baseJudge = `${origin}/judge/v1`;
  baseFail = `${origin}/fail/v1`;
});

beforeEach(() => {
  resetMockState();
});

afterAll(() => {
  mock.stop(true);
});

function seedProvider(db: Database, name: string, baseUrl: string, modelId: string): number {
  upsertProvider(db, { name, baseUrl });
  const provider = getProviderByName(db, name);
  if (provider === null) throw new Error(`provider ${name} missing after upsert`);
  addProviderModel(db, { providerId: provider.id, modelId });
  return provider.id;
}

function makeKey(
  db: Database,
  opts: { scopes?: string[]; budgetLimit?: number; budgetUsed?: number } = {},
): string {
  registerAgent(db, "fusion-agent", "agent");
  const keyHash = hashKey(generateKey());
  createAgentKey(db, {
    keyHash,
    agentName: "fusion-agent",
    scopes: opts.scopes,
    budgetLimit: opts.budgetLimit,
  });
  if (opts.budgetUsed !== undefined) {
    db.run("UPDATE agent_keys SET budget_used = ? WHERE key_hash = ?", [opts.budgetUsed, keyHash]);
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

function seedFusionRoute(db: Database, alias: string, config: unknown): void {
  db.run("INSERT INTO model_routes (alias, fallback_chain) VALUES (?, ?)", [
    alias,
    JSON.stringify(config),
  ]);
}

function fusionConfig(
  p1: string,
  p2: string,
  judge: string,
  strategy = "synthesize",
): Record<string, unknown> {
  return {
    mode: "fusion",
    panel: [
      { provider: p1, model: "m1" },
      { provider: p2, model: "m2" },
    ],
    judge: { provider: judge, model: "judge-m" },
    strategy,
  };
}

function seedFusionStack(
  db: Database,
  names: { p1: string; p2: string; judge: string },
  opts: {
    alias?: string;
    strategy?: string;
    p1Base?: string;
    p2Base?: string;
    judgeBase?: string;
  } = {},
): void {
  seedProvider(db, names.p1, opts.p1Base ?? baseP1, "m1");
  seedProvider(db, names.p2, opts.p2Base ?? baseP2, "m2");
  seedProvider(db, names.judge, opts.judgeBase ?? baseJudge, "judge-m");
  seedFusionRoute(
    db,
    opts.alias ?? "fusion",
    fusionConfig(names.p1, names.p2, names.judge, opts.strategy ?? "synthesize"),
  );
}

function judgeMessagesSerialized(): string {
  if (lastJudgeBody.length === 0) return "";
  const payload = JSON.parse(lastJudgeBody) as { messages?: unknown };
  return JSON.stringify(payload.messages ?? []);
}

describe("routeCompletion fusion", () => {
  test("fusion_not_configured when model is fusion and no fusion route exists", async () => {
    const db = createDb(":memory:");
    const keyHash = makeKey(db);

    await expectRouterError(
      () => routeCompletion(db, keyHash, fusionRequest, { decryptKey }),
      "fusion_not_configured",
    );
    db.close();
  });

  test("fans out panel in parallel and returns the judge synthesis rewritten as fusion", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "fo-p1", p2: "fo-p2", judge: "fo-judge" });
    const keyHash = makeKey(db);

    const response = await routeCompletion(db, keyHash, fusionRequest, { decryptKey });
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };
    expect(json.model).toBe("fusion");
    expect(json.choices[0].message.content).toBe("fused");
    expect(json.choices[0].message.content).not.toBe("draft-one");
    expect(json.choices[0].message.content).not.toBe("draft-two");

    expect(p1Calls).toBe(1);
    expect(p2Calls).toBe(1);
    expect(judgeCalls).toBe(1);

    const serialized = judgeMessagesSerialized();
    expect(serialized).toContain("draft-one");
    expect(serialized).toContain("draft-two");
    db.close();
  });

  test("meters N+1 usage rows for two proposers and the judge", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "mt-p1", p2: "mt-p2", judge: "mt-judge" });
    const keyHash = makeKey(db);

    const response = await routeCompletion(db, keyHash, fusionRequest, { decryptKey });
    expect(response.status).toBe(200);

    const usage = listUsage(db);
    expect(usage).toHaveLength(3);
    const byProvider = new Map(usage.map((row) => [row.provider_name, row]));
    expect(byProvider.get("mt-p1")?.total_tokens).toBe(6);
    expect(byProvider.get("mt-p1")?.prompt_tokens).toBe(4);
    expect(byProvider.get("mt-p1")?.completion_tokens).toBe(2);
    expect(byProvider.get("mt-p2")?.total_tokens).toBe(8);
    expect(byProvider.get("mt-p2")?.prompt_tokens).toBe(5);
    expect(byProvider.get("mt-p2")?.completion_tokens).toBe(3);
    expect(byProvider.get("mt-judge")?.total_tokens).toBe(14);
    expect(byProvider.get("mt-judge")?.prompt_tokens).toBe(10);
    expect(byProvider.get("mt-judge")?.completion_tokens).toBe(4);

    const summed = usage.reduce((sum, row) => sum + row.total_tokens, 0);
    expect(summed).toBe(28);
    const key = findActiveKeyByHash(db, keyHash);
    expect(key).not.toBeNull();
    expect(key!.budget_used).toBe(summed);
    db.close();
  });

  test("all proposers failing throws all_providers_failed without metering", async () => {
    const db = createDb(":memory:");
    seedFusionStack(
      db,
      { p1: "af-p1", p2: "af-p2", judge: "af-judge" },
      { p1Base: baseFail, p2Base: baseFail },
    );
    const keyHash = makeKey(db);

    const error = await expectRouterError(
      () => routeCompletion(db, keyHash, fusionRequest, { decryptKey }),
      "all_providers_failed",
    );
    const attempts = error.details?.attempts;
    expect(Array.isArray(attempts)).toBe(true);
    expect((attempts as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect(judgeCalls).toBe(0);
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("key scoped to fusion can request model fusion", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "sc-p1", p2: "sc-p2", judge: "sc-judge" });
    const keyHash = makeKey(db, { scopes: ["fusion"] });

    const response = await routeCompletion(db, keyHash, fusionRequest, { decryptKey });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { model: string };
    expect(json.model).toBe("fusion");
    db.close();
  });

  test("scope_denied for a key without fusion or wildcard scope", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "sd-p1", p2: "sd-p2", judge: "sd-judge" });
    const keyHash = makeKey(db, { scopes: ["other"] });

    await expectRouterError(
      () => routeCompletion(db, keyHash, fusionRequest, { decryptKey }),
      "scope_denied",
    );
    expect(p1Calls).toBe(0);
    expect(p2Calls).toBe(0);
    expect(judgeCalls).toBe(0);
    expect(failCalls).toBe(0);
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("alias with mode fusion rewrites response model to the alias", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "mx-p1", p2: "mx-p2", judge: "mx-judge" }, { alias: "mix" });
    const keyHash = makeKey(db);

    const response = await routeCompletion(
      db,
      keyHash,
      { ...fusionRequest, model: "mix" },
      { decryptKey },
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };
    expect(json.model).toBe("mix");
    expect(json.choices[0].message.content).toBe("fused");
    db.close();
  });

  test("stream true throws fusion_streaming_unsupported", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "st-p1", p2: "st-p2", judge: "st-judge" });
    const keyHash = makeKey(db);

    await expectRouterError(
      () =>
        routeCompletion(db, keyHash, { ...fusionRequest, stream: true }, { decryptKey }),
      "fusion_streaming_unsupported",
    );
    expect(p1Calls).toBe(0);
    expect(p2Calls).toBe(0);
    expect(judgeCalls).toBe(0);
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("strategy best_of throws fusion_strategy_unsupported", async () => {
    const db = createDb(":memory:");
    seedFusionStack(
      db,
      { p1: "bo-p1", p2: "bo-p2", judge: "bo-judge" },
      { strategy: "best_of" },
    );
    const keyHash = makeKey(db);

    await expectRouterError(
      () => routeCompletion(db, keyHash, fusionRequest, { decryptKey }),
      "fusion_strategy_unsupported",
    );
    expect(p1Calls).toBe(0);
    expect(p2Calls).toBe(0);
    expect(judgeCalls).toBe(0);
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("budget overshoot on proposers does not call the judge", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "bd-p1", p2: "bd-p2", judge: "bd-judge" });
    const keyHash = makeKey(db, { budgetLimit: 10 });

    await expectRouterError(
      () => routeCompletion(db, keyHash, fusionRequest, { decryptKey }),
      "budget_exceeded",
    );
    expect(judgeCalls).toBe(0);
    expect(p1Calls).toBe(1);
    expect(p2Calls).toBe(1);
    db.close();
  });

  test("skips disabled and blank-url panel hops without calling upstream", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "du-p1", p2: "du-p2", judge: "du-judge" });
    setProviderStatus(db, "du-p1", "disabled");
    db.run("UPDATE providers SET base_url = '' WHERE name = ?", ["du-p2"]);
    const keyHash = makeKey(db);

    await expectRouterError(
      () => routeCompletion(db, keyHash, fusionRequest, { decryptKey }),
      "all_providers_failed",
    );
    expect(p1Calls).toBe(0);
    expect(p2Calls).toBe(0);
    expect(judgeCalls).toBe(0);
    expect(failCalls).toBe(0);
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("a disabled judge is fusion_not_configured before any panel call", async () => {
    const db = createDb(":memory:");
    seedFusionStack(db, { p1: "dj-p1", p2: "dj-p2", judge: "dj-judge" });
    setProviderStatus(db, "dj-judge", "disabled");
    const keyHash = makeKey(db);

    await expectRouterError(
      () => routeCompletion(db, keyHash, fusionRequest, { decryptKey }),
      "fusion_not_configured",
    );
    expect(p1Calls).toBe(0);
    expect(p2Calls).toBe(0);
    expect(judgeCalls).toBe(0);
    expect(listUsage(db)).toHaveLength(0);
    db.close();
  });

  test("one failed proposer still sends successful drafts to the judge", async () => {
    const db = createDb(":memory:");
    seedFusionStack(
      db,
      { p1: "pp-p1", p2: "pp-p2", judge: "pp-judge" },
      { p2Base: baseFail },
    );
    const keyHash = makeKey(db);

    const response = await routeCompletion(db, keyHash, fusionRequest, { decryptKey });
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      model: string;
      choices: Array<{ message: { content: string } }>;
    };
    expect(json.model).toBe("fusion");
    expect(json.choices[0].message.content).toBe("fused");

    expect(p1Calls).toBe(1);
    expect(failCalls).toBe(1);
    expect(judgeCalls).toBe(1);

    const serialized = judgeMessagesSerialized();
    expect(serialized).toContain("draft-one");
    expect(serialized).not.toContain("draft-two");

    const usage = listUsage(db);
    expect(usage).toHaveLength(2);
    const names = usage.map((row) => row.provider_name);
    expect(names).toContain("pp-p1");
    expect(names).toContain("pp-judge");
    expect(names).not.toContain("pp-p2");
    db.close();
  });
});
