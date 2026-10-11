import { createAgentKey, listKeys, registerAgent, revokeKeyById } from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";
import type { Database } from "bun:sqlite";
import type { EphemeralKeyProvider } from "./types";

export const WORKER_AGENT_NAME = "cardinal-worker";
const DEFAULT_TTL_SECONDS = 300;

export class SqliteEphemeralKeyProvider implements EphemeralKeyProvider {
  constructor(private db: Database) {}

  async createEphemeralKey(_taskId: string, scopes: string[], ttlSeconds?: number): Promise<string> {
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : DEFAULT_TTL_SECONDS;
    registerAgent(this.db, WORKER_AGENT_NAME, "subagent");
    const key = generateKey();
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    createAgentKey(this.db, {
      keyHash: hashKey(key),
      agentName: WORKER_AGENT_NAME,
      kindOverride: "subagent",
      createdBy: "system",
      scopes,
      expiresAt,
    });
    return key;
  }

  async revokeEphemeralKey(key: string): Promise<void> {
    const keyHash = hashKey(key);
    const row = listKeys(this.db).find((item) => item.key_hash === keyHash);
    if (row === undefined || row.revoked_at !== null) return;
    revokeKeyById(this.db, row.id);
  }
}
