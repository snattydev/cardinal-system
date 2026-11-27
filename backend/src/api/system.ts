import type { Database } from "bun:sqlite";
import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import { getMcpUsageSummary, getSystemCounts } from "@cardinal/db";
import rootPkg from "../../../package.json";

export async function handleSystem(config: Config, db: Database): Promise<Response> {
  const dbSizeBytes =
    config.dbPath === ":memory:"
      ? 0
      : (await Bun.file(config.dbPath).stat().catch(() => ({ size: 0 }))).size;
  const counts = getSystemCounts(db);
  const mcp = getMcpUsageSummary(db);

  return json({
    version: rootPkg.version,
    uptime_seconds: Math.floor(process.uptime()),
    db_size_bytes: dbSizeBytes,
    agents_total: counts.agentsTotal,
    agents_online: counts.agentsOnline,
    keys_active: counts.keysActive,
    keys_revoked: counts.keysRevoked,
    mcp_calls_7d: mcp.calls7d,
    mcp_calls_30d: mcp.calls30d,
    mcp_last_call_at: mcp.lastCallAt,
  });
}
