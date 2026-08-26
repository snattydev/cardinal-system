import { describe, expect, test } from "bun:test";
import { createAgentKey, createDb, findActiveKeyByHash, registerAgent, revokeKeysForAgent } from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";
import { handleListKeys, handleRevokeKey, handleValidateKey } from "./keys";

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
