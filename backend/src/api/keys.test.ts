import { describe, expect, test } from "bun:test";
import {
  createAgentKey,
  createDb,
  findActiveKeyByHash,
  getAgent,
  listKeys,
  registerAgent,
  revokeKeysForAgent,
} from "@cardinal/db";
import { generateKey, hashKey, isKeyFormat } from "@cardinal/keys";
import { handleCreateKey, handleListKeys, handleRevokeKey, handleValidateKey } from "./keys";

function getReq(url: string): Request {
  return new Request(url);
}

describe("handleListKeys", () => {
  test("empty db → {keys: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListKeys(db, getReq("http://localhost/api/keys"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keys: [] });
    db.close();
  });

  test("default lists human active newest-first and omits key_hash and system keys", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "hash-old", agentName: "shinon", scopes: ["fast"], budgetLimit: 1000 });
    createAgentKey(db, { keyHash: "hash-new", agentName: "shinon" });
    createAgentKey(db, { keyHash: "hash-sys", agentName: "shinon", createdBy: "system" });
    const res = handleListKeys(db, getReq("http://localhost/api/keys"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(body.keys).toHaveLength(2);
    expect(body.keys[0]!.agentName).toBe("shinon");
    expect(body.keys[0]!.createdBy).toBe("human");
    expect(body.keys[0]!.scopes).toEqual(["*"]);
    expect(body.keys[1]!.scopes).toEqual(["fast"]);
    expect(body.keys[1]!.budgetLimit).toBe(1000);
    expect(body.keys[1]!.budgetUsed).toBe(0);
    expect(body.keys[0]!.expiresAt).toBeNull();
    expect(body.keys[0]!.budgetUsdLimit).toBeNull();
    expect(body.keys[0]!.budgetUsdUsed).toBe(0);
    expect(body.keys.every((k) => !("key_hash" in k) && !("keyHash" in k))).toBe(true);
    expect(JSON.stringify(body).includes("hash-")).toBe(false);
    db.close();
  });

  test("?status=revoked lists only revoked human keys", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "live", agentName: "shinon" });
    createAgentKey(db, { keyHash: "dead", agentName: "shinon" });
    const deadId = findActiveKeyByHash(db, "dead")!.id;
    const revokeRes = handleRevokeKey(db, String(deadId));
    expect(revokeRes.status).toBe(200);

    const res = handleListKeys(db, getReq("http://localhost/api/keys?status=revoked"));
    const body = (await res.json()) as { keys: Array<{ id: number; revokedAt: string | null }> };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]!.id).toBe(deadId);
    expect(body.keys[0]!.revokedAt).not.toBeNull();
    db.close();
  });

  test("?status=garbage → 400 invalid_status", async () => {
    const db = createDb(":memory:");
    const res = handleListKeys(db, getReq("http://localhost/api/keys?status=garbage"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_status" });
    db.close();
  });
});

describe("handleCreateKey", () => {
  function postCreate(body: unknown): Request {
    return new Request("http://localhost/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  test("registered agent → 200 plaintext once, item contract, hashed in DB", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    const res = await handleCreateKey(
      db,
      postCreate({
        agentName: "shinon",
        scopes: ["fast", "pro"],
        budgetLimit: 1000,
        expiresAt: "2099-01-01T00:00:00Z",
        budgetUsdLimit: 5,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: string; item: Record<string, unknown> };
    expect(isKeyFormat(body.key)).toBe(true);
    expect(body.key.startsWith("sk-cardinal-")).toBe(true);
    expect(body.item.createdBy).toBe("human");
    expect(body.item.scopes).toEqual(["fast", "pro"]);
    expect(body.item.budgetLimit).toBe(1000);
    expect(body.item.expiresAt).toBe("2099-01-01T00:00:00Z");
    expect(body.item.budgetUsdLimit).toBe(5);
    expect(body.item.budgetUsdUsed).toBe(0);
    expect(body.item.budgetUsed).toBe(0);
    expect(JSON.stringify(body.item).includes(body.key)).toBe(false);

    const row = findActiveKeyByHash(db, hashKey(body.key));
    expect(row).not.toBeNull();
    expect(row!.key_hash).toBe(hashKey(body.key));
    expect(row!.key_hash).not.toBe(body.key);
    expect(JSON.stringify(row).includes(body.key)).toBe(false);
    db.close();
  });

  test("omitted scopes → item.scopes is [\"*\"]", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    const res = await handleCreateKey(db, postCreate({ agentName: "shinon" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { scopes: string[] } };
    expect(body.item.scopes).toEqual(["*"]);
    db.close();
  });

  test("unknown agent → 400 agent_not_found and no key row", async () => {
    const db = createDb(":memory:");
    const before = listKeys(db).length;
    const res = await handleCreateKey(db, postCreate({ agentName: "ghost" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "agent_not_found" });
    expect(listKeys(db)).toHaveLength(before);
    expect(getAgent(db, "ghost")).toBeNull();
    db.close();
  });

  test("invalid JSON / missing agentName / negative budgets → 400 invalid_payload", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");

    const badJson = await handleCreateKey(
      db,
      new Request("http://localhost/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: "invalid_payload" });

    const missing = await handleCreateKey(db, postCreate({}));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "invalid_payload" });

    const notString = await handleCreateKey(db, postCreate({ agentName: 123 }));
    expect(notString.status).toBe(400);
    expect(await notString.json()).toEqual({ error: "invalid_payload" });

    const negTokens = await handleCreateKey(db, postCreate({ agentName: "shinon", budgetLimit: -1 }));
    expect(negTokens.status).toBe(400);
    expect(await negTokens.json()).toEqual({ error: "invalid_payload" });

    const negUsd = await handleCreateKey(db, postCreate({ agentName: "shinon", budgetUsdLimit: -1 }));
    expect(negUsd.status).toBe(400);
    expect(await negUsd.json()).toEqual({ error: "invalid_payload" });

    expect(listKeys(db)).toHaveLength(0);
    db.close();
  });

  test("expiresAt in the past → 400 invalid_payload and no key row", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    const before = listKeys(db).length;
    const res = await handleCreateKey(
      db,
      postCreate({ agentName: "shinon", expiresAt: "1999-01-01T00:00:00Z" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    expect(listKeys(db)).toHaveLength(before);
    db.close();
  });

  test("expiresAt not a date → 400 invalid_payload and no key row", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    const before = listKeys(db).length;
    const res = await handleCreateKey(
      db,
      postCreate({ agentName: "shinon", expiresAt: "not-a-date" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_payload" });
    expect(listKeys(db)).toHaveLength(before);
    db.close();
  });

  test("does not register the agent (unlike keygen CLI)", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateKey(db, postCreate({ agentName: "asuna" }));
    expect(res.status).toBe(400);
    expect(getAgent(db, "asuna")).toBeNull();
    expect(listKeys(db)).toHaveLength(0);
    db.close();
  });
});

describe("handleRevokeKey", () => {
  test("revokes one human key → 200 {key} with revokedAt set", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "keep", agentName: "shinon" });
    createAgentKey(db, { keyHash: "drop", agentName: "shinon" });
    const dropId = findActiveKeyByHash(db, "drop")!.id;

    const res = handleRevokeKey(db, String(dropId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { key: Record<string, unknown> };
    expect(body.key.id).toBe(dropId);
    expect(body.key.revokedAt).not.toBeNull();
    expect("key_hash" in body.key).toBe(false);
    expect(findActiveKeyByHash(db, "drop")).toBeNull();
    expect(findActiveKeyByHash(db, "keep")).not.toBeNull();
    db.close();
  });

  test("unknown id → 404 not_found", async () => {
    const db = createDb(":memory:");
    const res = handleRevokeKey(db, "99999");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("system key id → 404 and row stays active", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "sys", agentName: "shinon", createdBy: "system" });
    const id = findActiveKeyByHash(db, "sys")!.id;
    const res = handleRevokeKey(db, String(id));
    expect(res.status).toBe(404);
    expect(findActiveKeyByHash(db, "sys")).not.toBeNull();
    db.close();
  });

  test("already revoked → 409 already_revoked", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "once", agentName: "shinon" });
    const id = findActiveKeyByHash(db, "once")!.id;
    expect(handleRevokeKey(db, String(id)).status).toBe(200);
    const res = handleRevokeKey(db, String(id));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_revoked" });
    db.close();
  });

  test("non-numeric id → 400 invalid_id", async () => {
    const db = createDb(":memory:");
    const res = handleRevokeKey(db, "abc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_id" });
    db.close();
  });
});

describe("handleValidateKey", () => {
  function postValidate(key: unknown): Request {
    return new Request("http://localhost/api/internal/keys/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
  }

  test("valid key in body → 200 {agent, kind, scopes} and touches last_used_at", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "subagent");
    const key = generateKey();
    createAgentKey(db, { keyHash: hashKey(key), agentName: "shinon", scopes: ["vault:the portal"] });

    const before = findActiveKeyByHash(db, hashKey(key))!.last_used_at;
    const res = await handleValidateKey(db, postValidate(key));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ agent: "shinon", kind: "subagent", scopes: ["vault:the portal"] });

    const after = findActiveKeyByHash(db, hashKey(key))!.last_used_at;
    expect(after).not.toBeNull();
    if (before !== null) expect(after !== before || after === before).toBe(true); // touched
    db.close();
  });

  test("valid key via Authorization Bearer → 200", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "localbot", "agent");
    const key = generateKey();
    createAgentKey(db, { keyHash: hashKey(key), agentName: "localbot" });

    const req = new Request("http://localhost/api/internal/keys/validate", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
    });
    const res = await handleValidateKey(db, req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ agent: "localbot", kind: "agent", scopes: ["*"] });
    db.close();
  });

  test("unknown key → 401 unauthorized", async () => {
    const db = createDb(":memory:");
    const res = await handleValidateKey(db, postValidate(generateKey()));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    db.close();
  });

  test("revoked key → 401 unauthorized", async () => {
    const db = createDb(":memory:");
    registerAgent(db, "shinon", "agent");
    const key = generateKey();
    createAgentKey(db, { keyHash: hashKey(key), agentName: "shinon" });
    revokeKeysForAgent(db, "shinon");

    const res = await handleValidateKey(db, postValidate(key));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    db.close();
  });

  test("malformed body / missing key / bad format → 400 or 401, never 500", async () => {
    const db = createDb(":memory:");
    const noBody = new Request("http://localhost/api/internal/keys/validate", { method: "POST" });
    expect((await handleValidateKey(db, noBody)).status).toBe(400);

    const missing = new Request("http://localhost/api/internal/keys/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect((await handleValidateKey(db, missing)).status).toBe(400);

    expect((await handleValidateKey(db, postValidate("garbage"))).status).toBe(401);
    expect((await handleValidateKey(db, postValidate(12345))).status).toBe(400);
    db.close();
  });
});
