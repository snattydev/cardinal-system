import { describe, expect, test } from "bun:test";
import { createDb, findActiveKeyByHash, getAgent, getKeyById } from "@cardinal/db";
import { hashKey, isKeyFormat } from "@cardinal/keys";
import { SqliteEphemeralKeyProvider, WORKER_AGENT_NAME } from "./key-provider";

describe("SqliteEphemeralKeyProvider", () => {
  test("mints a system key for the worker agent and revokes it", async () => {
    const db = createDb(":memory:");
    const provider = new SqliteEphemeralKeyProvider(db);
    const scopes = ["task:worker", "router:completions", "knowledge/*"];

    const key = await provider.createEphemeralKey("task-9", scopes, 120);

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
    expect(Date.parse(row!.expires_at!)).toBeGreaterThan(Date.now());

    await provider.revokeEphemeralKey(key);

    expect(findActiveKeyByHash(db, hashKey(key))).toBeNull();
    const revoked = getKeyById(db, row!.id);
    expect(revoked?.revoked_at).not.toBeNull();
  });
});
