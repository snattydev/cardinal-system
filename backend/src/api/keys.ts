import type { Database } from "bun:sqlite";
import type { AgentKeyRow } from "@cardinal/core";
import { json } from "@cardinal/core";
import {
  findActiveKeyByHash,
  getAgent,
  getKeyById,
  listHumanKeys,
  revokeKeyById,
  touchKey,
} from "@cardinal/db";
import { hashKey, isKeyFormat } from "@cardinal/keys";

export interface KeyItem {
  id: number;
  agentName: string;
  createdBy: string;
  scopes: string[];
  budgetLimit: number | null;
  budgetUsed: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function toKeyItem(row: AgentKeyRow): KeyItem {
  let scopes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.scopes);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      scopes = parsed;
    }
  } catch {
    scopes = [];
  }
  return {
    id: row.id,
    agentName: row.agent_name,
    createdBy: row.created_by,
    scopes,
    budgetLimit: row.budget_limit,
    budgetUsed: row.budget_used,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function handleListKeys(db: Database, req: Request): Response {
  const statusParam = new URL(req.url).searchParams.get("status") ?? "active";
  if (statusParam !== "active" && statusParam !== "revoked") {
    return json({ error: "invalid_status" }, 400);
  }
  return json({ keys: listHumanKeys(db, statusParam).map(toKeyItem) });
}

export function handleRevokeKey(db: Database, idRaw: string): Response {
  if (!/^\d+$/.test(idRaw)) return json({ error: "invalid_id" }, 400);
  const id = Number(idRaw);
  const existing = getKeyById(db, id);
  if (existing === null || existing.created_by !== "human") {
    return json({ error: "not_found" }, 404);
  }
  if (existing.revoked_at !== null) {
    return json({ error: "already_revoked" }, 409);
  }
  const row = revokeKeyById(db, id);
  if (row === null) return json({ error: "not_found" }, 404);
  return json({ key: toKeyItem(row) });
}

function parseScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}

export async function handleValidateKey(db: Database, req: Request): Promise<Response> {
  // La key puede venir en el body (JSON) o como Authorization Bearer.
  let key: unknown;
  const auth = req.headers.get("authorization");
  if (auth !== null && auth.startsWith("Bearer ")) {
    key = auth.slice("Bearer ".length).trim();
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_request" }, 400);
    }
    if (body === null || typeof body !== "object") return json({ error: "bad_request" }, 400);
    key = (body as Record<string, unknown>).key;
  }

  if (typeof key !== "string") return json({ error: "bad_request" }, 400);
  if (!isKeyFormat(key)) return json({ error: "unauthorized" }, 401);

  const row = findActiveKeyByHash(db, hashKey(key));
  if (row === null) return json({ error: "unauthorized" }, 401);

  touchKey(db, row.id);
  return json({
    agent: row.agent_name,
    kind: row.kind_override ?? getAgent(db, row.agent_name)?.kind ?? "agent",
    scopes: parseScopes(row.scopes),
  });
}
