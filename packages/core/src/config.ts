export interface Config {
  port: number;
  dbPath: string;
  adminUser: string;
  adminPasswordHash: string;
  jwtSecret: string;
  poolSecret: string;
  staticDir: string;
  pingIntervalMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (!env.ADMIN_USER) {
    throw new Error("ADMIN_USER is required");
  }
  if (!env.ADMIN_PASSWORD_HASH) {
    throw new Error("ADMIN_PASSWORD_HASH is required");
  }
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }
  if (!env.POOL_SECRET) {
    throw new Error("POOL_SECRET is required");
  }
  return {
    port: Number(env.PORT ?? 8787),
    dbPath: env.DB_PATH ?? "./cardinal.db",
    adminUser: env.ADMIN_USER,
    adminPasswordHash: env.ADMIN_PASSWORD_HASH,
    jwtSecret: env.JWT_SECRET,
    poolSecret: env.POOL_SECRET,
    staticDir: env.STATIC_DIR ?? "frontend/dist",
    pingIntervalMs: Number(env.PING_INTERVAL_MS ?? 30000),
  };
}
