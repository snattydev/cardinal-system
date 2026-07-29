import type { Database } from "bun:sqlite";
import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import rootPkg from "../../../package.json";

export async function handleSystem(config: Config, db: Database): Promise<Response> {
  const dbStat = await Bun.file(config.dbPath).stat();
  const dbSize = dbStat.size;

  const count = (sql: string) =>
    (db.query(sql).get() as { count: number }).count;

  return json({
    version: rootPkg.version,
    uptime_seconds: Math.floor(process.uptime()),
    db_path: config.dbPath,
    db_size_bytes: dbSize,
    agents_total: count("SELECT COUNT(*) AS count FROM agents"),
    agents_online: count("SELECT COUNT(*) AS count FROM agents WHERE connected = 1"),
    keys_active: count("SELECT COUNT(*) AS count FROM agent_keys WHERE revoked_at IS NULL"),
    keys_revoked: count(
      "SELECT COUNT(*) AS count FROM agent_keys WHERE revoked_at IS NOT NULL",
    ),
  });
}
