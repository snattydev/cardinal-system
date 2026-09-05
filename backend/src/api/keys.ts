import type { Database } from "bun:sqlite";
import type { AgentKeyRow } from "@cardinal/core";
import { json } from "@cardinal/core";
import {
  createAgentKey,
  findActiveKeyByHash,
  getAgent,
  getKeyById,
  listHumanKeys,
  revokeKeyById,
  touchKey,
} from "@cardinal/db";
import { generateKey, hashKey, isKeyFormat } from "@cardinal/keys";

export interface KeyItem {
  id: number;
  agentName: string;
  createdBy: string;
  scopes: string[];
  budgetLimit: number | null;
  budgetUsed: number;
  expiresAt: string | null;
  budgetUsdLimit: number | null;
  budgetUsdUsed: number;
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
    expiresAt: row.expires_at,
    budgetUsdLimit: row.budget_usd_limit,
    budgetUsdUsed: row.budget_usd_used,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function handleCreateKey(db: Database, req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid_payload" }, 400);
  }
  const payload = body as Record<string, unknown>;

  if (typeof payload.agentName !== "string" || payload.agentName.length === 0) {
    return json({ error: "invalid_payload" }, 400);
  }
  const agentName = payload.agentName;

  let scopes: string[] | undefined;
  if (payload.scopes !== undefined) {
    if (!Array.isArray(payload.scopes) || !payload.scopes.every((s) => typeof s === "string")) {
      return json({ error: "invalid_payload" }, 400);
    }
    scopes = payload.scopes;
  }

  let budgetLimit: number | undefined;
  if (payload.budgetLimit !== undefined && payload.budgetLimit !== null) {
    if (!isNonNegativeFinite(payload.budgetLimit)) {
      return json({ error: "invalid_payload" }, 400);
    }
    budgetLimit = payload.budgetLimit;
  }

  let budgetUsdLimit: number | undefined;
  if (payload.budgetUsdLimit !== undefined && payload.budgetUsdLimit !== null) {
    if (!isNonNegativeFinite(payload.budgetUsdLimit)) {
      return json({ error: "invalid_payload" }, 400);
    }
    budgetUsdLimit = payload.budgetUsdLimit;
  }

  let expiresAt: string | undefined;
  if (payload.expiresAt !== undefined && payload.expiresAt !== null) {
    if (typeof payload.expiresAt !== "string") {
      return json({ error: "invalid_payload" }, 400);
    }
    const t = Date.parse(payload.expiresAt);
    if (Number.isNaN(t) || t <= Date.now()) {
      return json({ error: "invalid_payload" }, 400);
    }
    expiresAt = payload.expiresAt;
  }

  if (getAgent(db, agentName) === null) {
    return json({ error: "agent_not_found" }, 400);
  }

  const plaintext = generateKey();
  createAgentKey(db, {
    keyHash: hashKey(plaintext),
    agentName,
    scopes,
    budgetLimit,
    expiresAt,
    budgetUsdLimit,
  });
  const row = findActiveKeyByHash(db, hashKey(plaintext));
  return json({ key: plaintext, item: toKeyItem(row!) });
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
