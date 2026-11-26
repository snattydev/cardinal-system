import { describe, expect, test } from "bun:test";
import { createDb, findActiveKeyByHash, getAgent, getKeyById } from "@cardinal/db";
import { hashKey, isKeyFormat } from "@cardinal/keys";
import { SqliteEphemeralKeyProvider, WORKER_AGENT_NAME } from "./key-provider";

describe("SqliteEphemeralKeyProvider", () => {
  test("mints a system key for the worker agent and revokes it", async () => {
    const db = createDb(":memory:");
    const provider = new SqliteEphemeralKeyProvider(db);
    const scopes = ["task:worker", "router:completions", "knowledge/*"];

    const before = Date.now();
    const key = await provider.createEphemeralKey("task-9", scopes, 120);
    const after = Date.now();

    expect(isKeyFormat(key)).toBe(true);
    const agent = getAgent(db, WORKER_AGENT_NAME);
    expect(agent?.kind).toBe("subagent");

    const row = findActiveKeyByHash(db, hashKey(key));
    expect(row).not.toBeNull();
    expect(row?.created_by).toBe("system");
    expect(row?.agent_name).toBe(WORKER_AGENT_NAME);
    expect(row?.kind_override).toBe("subagent");
    expect(JSON.parse(row?.scopes ?? "[]")).toEqual(scopes);
    expect(row?.expires_at).not.toBeNull();
    const expiresAt = Date.parse(row!.expires_at!);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 120_000);
    expect(expiresAt).toBeLessThanOrEqual(after + 120_000);

    await provider.revokeEphemeralKey(key);

    expect(findActiveKeyByHash(db, hashKey(key))).toBeNull();
    const revoked = getKeyById(db, row!.id);
    expect(revoked?.revoked_at).not.toBeNull();
  });

  test("defaults a non-positive TTL to 300s and ignores unknown or repeat revokes", async () => {
    const db = createDb(":memory:");
    const provider = new SqliteEphemeralKeyProvider(db);
    const scopes = ["task:worker"];

    const before = Date.now();
    const omitted = await provider.createEphemeralKey("task-default", scopes);
    const afterOmitted = Date.now();
    const omittedExpires = Date.parse(findActiveKeyByHash(db, hashKey(omitted))!.expires_at!);
    expect(omittedExpires).toBeGreaterThanOrEqual(before + 300_000);
    expect(omittedExpires).toBeLessThanOrEqual(afterOmitted + 300_000);

    const beforeZero = Date.now();
    const zeroTtl = await provider.createEphemeralKey("task-zero", scopes, 0);
    const afterZero = Date.now();
    const zeroExpires = Date.parse(findActiveKeyByHash(db, hashKey(zeroTtl))!.expires_at!);
    expect(zeroExpires).toBeGreaterThanOrEqual(beforeZero + 300_000);
    expect(zeroExpires).toBeLessThanOrEqual(afterZero + 300_000);

    await provider.revokeEphemeralKey("not-a-cardinal-key");
    expect(findActiveKeyByHash(db, hashKey(omitted))).not.toBeNull();

    await provider.revokeEphemeralKey(omitted);
    await provider.revokeEphemeralKey(omitted);
    expect(findActiveKeyByHash(db, hashKey(omitted))).toBeNull();
    expect(findActiveKeyByHash(db, hashKey(zeroTtl))).not.toBeNull();
  });
});
