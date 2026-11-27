import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

const requiredEnv: Record<string, string> = {
  ADMIN_USER: "admin",
  ADMIN_PASSWORD_HASH: "argon2:fakehash",
  JWT_SECRET: "test-secret",
  POOL_SECRET: "test-pool-secret",
};

describe("loadConfig", () => {
  test("throws when ADMIN_USER is missing", () => {
    const env = { ...requiredEnv };
    delete env.ADMIN_USER;
    expect(() => loadConfig(env)).toThrow("ADMIN_USER is required");
  });

  test("throws when ADMIN_PASSWORD_HASH is missing", () => {
    const env = { ...requiredEnv };
    delete env.ADMIN_PASSWORD_HASH;
    expect(() => loadConfig(env)).toThrow("ADMIN_PASSWORD_HASH is required");
  });

  test("throws when JWT_SECRET is missing", () => {
    const env = { ...requiredEnv };
    delete env.JWT_SECRET;
    expect(() => loadConfig(env)).toThrow("JWT_SECRET is required");
  });

  test("throws when POOL_SECRET is missing", () => {
    const env = { ...requiredEnv };
    delete env.POOL_SECRET;
    expect(() => loadConfig(env)).toThrow("POOL_SECRET is required");
  });

  test("returns defaults when only the required vars are present", () => {
    const config = loadConfig({ ...requiredEnv });
    expect(config.port).toBe(8787);
    expect(config.dbPath).toBe("./cardinal.db");
    expect(config.staticDir).toBe("frontend/dist");
    expect(config.pingIntervalMs).toBe(30000);
    expect(config.adminUser).toBe("admin");
    expect(config.adminPasswordHash).toBe("argon2:fakehash");
    expect(config.jwtSecret).toBe("test-secret");
    expect(config.poolSecret).toBe("test-pool-secret");
    expect(config.internalServiceSecret).toBeUndefined();
  });

  test("respects explicit overrides", () => {
    const config = loadConfig({
      ...requiredEnv,
      PORT: "9999",
      DB_PATH: "/tmp/cardinal-test.db",
      STATIC_DIR: "public",
      PING_INTERVAL_MS: "5000",
      INTERNAL_SERVICE_SECRET: "  svc-secret-123  ",
    });
    expect(config.port).toBe(9999);
    expect(config.dbPath).toBe("/tmp/cardinal-test.db");
    expect(config.staticDir).toBe("public");
    expect(config.pingIntervalMs).toBe(5000);
    expect(config.internalServiceSecret).toBe("svc-secret-123");
  });
});
