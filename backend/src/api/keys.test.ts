import { describe, expect, test } from "bun:test";
import { createAgentKey, createDb, findActiveKeyByHash, registerAgent } from "@cardinal/db";
import { handleListKeys, handleRevokeKey } from "./keys";

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
