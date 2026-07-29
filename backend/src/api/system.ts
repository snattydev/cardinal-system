import type { Database } from "bun:sqlite";
import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import { getSystemCounts } from "@cardinal/db";
import rootPkg from "../../../package.json";

export async function handleSystem(config: Config, db: Database): Promise<Response> {
  const dbStat = await Bun.file(config.dbPath).stat();
  const counts = getSystemCounts(db);

  return json({
    version: rootPkg.version,
    uptime_seconds: Math.floor(process.uptime()),
    db_size_bytes: dbStat.size,
    agents_total: counts.agentsTotal,
    agents_online: counts.agentsOnline,
    keys_active: counts.keysActive,
    keys_revoked: counts.keysRevoked,
  });
}
