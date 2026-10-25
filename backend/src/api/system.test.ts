import { afterEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import type { Config } from "@cardinal/core";
import { createAgentKey, createDb, registerAgent } from "@cardinal/db";
import rootPkg from "../../../package.json";
import { handleSystem } from "./system";

function tempDbPath(): string {
  return `/tmp/cardinal-system-test-${crypto.randomUUID()}.db`;
}

function minimalConfig(dbPath: string): Config {
  return {
    port: 0,
    dbPath,
    adminUser: "admin",
    adminPasswordHash: "unused",
    jwtSecret: "test-secret",
    poolSecret: "test-pool-secret",
    staticDir: "/nonexistent",
    pingIntervalMs: 1000,
  };
}

describe("handleSystem", () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const path of paths.splice(0)) {
      try {
        unlinkSync(path);
      } catch {
        // already removed
      }
    }
  });

  test("returns version, uptime, db size, and human key counts", async () => {
    const dbPath = tempDbPath();
    paths.push(dbPath);
    const db = createDb(dbPath);
    registerAgent(db, "shinon", "agent");
    createAgentKey(db, { keyHash: "human-live", agentName: "shinon" });
    createAgentKey(db, { keyHash: "human-expired", agentName: "shinon", expiresAt: "1999-01-01T00:00:00Z" });
    createAgentKey(db, { keyHash: "system-live", agentName: "shinon", createdBy: "system" });

    const res = await handleSystem(minimalConfig(dbPath), db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.version).toBe(rootPkg.version);
    expect(typeof body.uptime_seconds).toBe("number");
    expect(body.db_size_bytes).toBeGreaterThan(0);
    expect(body.agents_total).toBe(1);
    expect(body.keys_active).toBe(1);
    expect(body.keys_revoked).toBe(0);

    db.close();
  });
});
