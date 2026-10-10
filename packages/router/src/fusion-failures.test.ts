import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  addProviderModel,
  createAgentKey,
  createDb,
  getProviderByName,
  listUsage,
  registerAgent,
  upsertProvider,
} from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";
import { routeCompletion, RouterError } from "./index";

const STRING_DRAFT = {
  choices: [{ message: { role: "assistant", content: "draft-two" } }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
};

const OBJECT_DRAFT = {
  choices: [{ message: { role: "assistant", content: { nested: "OBJECT-DRAFT" } } }],
  usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
};

const JUDGE_OK = {
  choices: [{ message: { role: "assistant", content: "fused" } }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  model: "judge-upstream",
};

const decryptKey = (enc: string): string => enc;
const fusionRequest = {
  model: "fusion",
  messages: [{ role: "user", content: "hi" }],
};

let mock: ReturnType<typeof Bun.serve>;
let origin = "";
let judgeBody = "";
let calls = 0;

beforeAll(() => {
  mock = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      calls += 1;
      const url = new URL(req.url);
      if (url.pathname.startsWith("/object/")) return Response.json(OBJECT_DRAFT);
      if (url.pathname.startsWith("/string/")) return Response.json(STRING_DRAFT);
      if (url.pathname.startsWith("/judge-ok/")) {
        judgeBody = await req.text();
        return Response.json(JUDGE_OK);
      }
      if (url.pathname.startsWith("/judge-fail/")) {
        return new Response("JUDGE-SECRET-BODY", { status: 500 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  origin = `http://127.0.0.1:${mock.port}`;
});

afterAll(() => {
  mock.stop(true);
});

function seedProvider(db: Database, name: string, baseUrl: string, modelId: string): void {
  upsertProvider(db, { name, baseUrl });
  const provider = getProviderByName(db, name);
  if (provider === null) throw new Error(`provider ${name} missing`);
  addProviderModel(db, { providerId: provider.id, modelId });
}

function makeKey(db: Database): string {
  registerAgent(db, "fusion-fail-agent", "agent");
  const keyHash = hashKey(generateKey());
  createAgentKey(db, { keyHash, agentName: "fusion-fail-agent", scopes: ["*"] });
  return keyHash;
}

function seedFusion(
  db: Database,
  names: { p1: string; p2: string; judge: string },
  bases: { p1: string; p2: string; judge: string },
): void {
  seedProvider(db, names.p1, bases.p1, "m1");
  seedProvider(db, names.p2, bases.p2, "m2");
  seedProvider(db, names.judge, bases.judge, "judge-m");
  db.run("INSERT INTO model_routes (alias, fallback_chain) VALUES (?, ?)", [
    "fusion",
    JSON.stringify({
      mode: "fusion",
      panel: [
        { provider: names.p1, model: "m1" },
        { provider: names.p2, model: "m2" },
      ],
      judge: { provider: names.judge, model: "judge-m" },
      strategy: "synthesize",
    }),
  ]);
}

describe("fusion failure edges", () => {
  test("a non-string draft is not sent to the judge", async () => {
    const db = createDb(":memory:");
    judgeBody = "";
    calls = 0;
    seedFusion(
      db,
      { p1: "obj-p", p2: "str-p", judge: "ok-judge" },
      {
        p1: `${origin}/object/v1`,
        p2: `${origin}/string/v1`,
        judge: `${origin}/judge-ok/v1`,
      },
    );

    const response = await routeCompletion(db, makeKey(db), fusionRequest, { decryptKey });
    expect(response.status).toBe(200);
    expect(judgeBody).toContain("draft-two");
    expect(judgeBody).not.toContain("OBJECT-DRAFT");
    const models = listUsage(db).map((row) => row.model_id).sort();
    expect(models).toEqual(["judge-m", "m2"]);
    db.close();
  });

  test("a failing judge is all_providers_failed and its body is not returned", async () => {
    const db = createDb(":memory:");
    calls = 0;
    seedFusion(
      db,
      { p1: "fail-p1", p2: "fail-p2", judge: "bad-judge" },
      {
        p1: `${origin}/string/v1`,
        p2: `${origin}/string/v1`,
        judge: `${origin}/judge-fail/v1`,
      },
    );

    let caught: RouterError | null = null;
    try {
      await routeCompletion(db, makeKey(db), fusionRequest, { decryptKey });
    } catch (err) {
      caught = err as RouterError;
    }
    expect(caught).toBeInstanceOf(RouterError);
    expect(caught?.code).toBe("all_providers_failed");
    const details = JSON.stringify(caught?.details ?? {});
    expect(details).toContain("bad-judge");
    expect(details).toContain("500");
    expect(details).not.toContain("JUDGE-SECRET-BODY");
    expect(listUsage(db).map((row) => row.model_id).sort()).toEqual(["m1", "m2"]);
    db.close();
  });

  test("an empty fusion panel fails before any upstream call", async () => {
    const db = createDb(":memory:");
    calls = 0;
    db.run("INSERT INTO model_routes (alias, fallback_chain) VALUES (?, ?)", [
      "fusion",
      JSON.stringify({
        mode: "fusion",
        panel: [],
        judge: { provider: "nobody", model: "m" },
        strategy: "synthesize",
      }),
    ]);

    await expect(routeCompletion(db, makeKey(db), fusionRequest, { decryptKey })).rejects.toMatchObject({
      code: "fusion_not_configured",
    });
    expect(calls).toBe(0);
    db.close();
  });
});
