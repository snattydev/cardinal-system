import type { Database } from "bun:sqlite";
import type { ModelRouteRow, ProviderModelRow, ProviderRow, ProviderStatus, WireFormat } from "@cardinal/core";
import { json } from "@cardinal/core";
import type { ModelRouteHop } from "@cardinal/db";
import {
  addProviderModel,
  getModelRoute,
  getProviderByName,
  listModelRoutes,
  listProviderModels,
  listProviders,
  setProviderStatus,
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import { encryptSecret } from "@cardinal/keys";

type Hop = { provider: string; model: string };

function toPublicProvider(row: ProviderRow) {
  return {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    wire_format: row.wire_format,
    status: row.status,
    rpm_limit: row.rpm_limit,
    tpm_limit: row.tpm_limit,
    cost_per_mtok: row.cost_per_mtok,
    created_at: row.created_at,
  };
}

function toPublicModel(row: ProviderModelRow) {
  return {
    provider_id: row.provider_id,
    model_id: row.model_id,
    capabilities: row.capabilities,
    context_window: row.context_window,
  };
}

function parseFallbackChain(raw: string): Hop[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const hops: Hop[] = [];
  for (const item of parsed) {
    if (isValidHop(item)) hops.push({ provider: item.provider, model: item.model });
  }
  return hops;
}

function decodeAlias(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function toPublicRoute(row: ModelRouteRow) {
  return {
    alias: row.alias,
    fallback_chain: parseFallbackChain(row.fallback_chain),
    created_at: row.created_at,
  };
}

function isValidHop(value: unknown): value is ModelRouteHop {
  if (value === null || typeof value !== "object") return false;
  const hop = value as Record<string, unknown>;
  return (
    typeof hop.provider === "string" &&
    hop.provider.length > 0 &&
    typeof hop.model === "string" &&
    hop.model.length > 0
  );
}

export function handleListRouterProviders(db: Database): Response {
  const providers = listProviders(db);
  const models: ReturnType<typeof toPublicModel>[] = [];
  for (const provider of providers) {
    for (const model of listProviderModels(db, provider.id)) {
      models.push(toPublicModel(model));
    }
  }
  return json({ providers: providers.map(toPublicProvider), models });
}

export function handleListRouterRoutes(db: Database): Response {
  return json({ routes: listModelRoutes(db).map(toPublicRoute) });
}

const WIRE_FORMATS: WireFormat[] = ["openai", "anthropic", "gemini"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function handleCreateRouterProvider(
  db: Database,
  req: Request,
  poolSecret: string,
): Promise<Response> {
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

  if (!isNonEmptyString(payload.name) || !isNonEmptyString(payload.base_url) || !isNonEmptyString(payload.api_key)) {
    return json({ error: "invalid_payload" }, 400);
  }
  if (!Array.isArray(payload.models) || payload.models.length === 0 || !payload.models.every(isNonEmptyString)) {
    return json({ error: "invalid_payload" }, 400);
  }

  let wireFormat: WireFormat = "openai";
  if (payload.wire_format !== undefined) {
    if (typeof payload.wire_format !== "string" || !WIRE_FORMATS.includes(payload.wire_format as WireFormat)) {
      return json({ error: "invalid_payload" }, 400);
    }
    wireFormat = payload.wire_format as WireFormat;
  }

  let costPerMtok = 0;
  if (payload.cost_per_mtok !== undefined) {
    if (!isNonNegativeFinite(payload.cost_per_mtok)) {
      return json({ error: "invalid_payload" }, 400);
    }
    costPerMtok = payload.cost_per_mtok;
  }

  const name = payload.name.trim();
  const baseUrl = payload.base_url.trim();
  upsertProvider(db, {
    name,
    baseUrl,
    apiKeyEnc: encryptSecret(payload.api_key, poolSecret),
    wireFormat,
    costPerMtok,
  });
  const provider = getProviderByName(db, name);
  if (!provider) return json({ error: "not_found" }, 500);

  for (const modelId of payload.models) {
    addProviderModel(db, { providerId: provider.id, modelId: modelId.trim() });
  }

  return json({
    provider: toPublicProvider(provider),
    models: listProviderModels(db, provider.id).map(toPublicModel),
  });
}

export async function handlePatchRouterProvider(
  db: Database,
  idRaw: string,
  req: Request,
): Promise<Response> {
  if (!/^\d+$/.test(idRaw)) return json({ error: "invalid_id" }, 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid_status" }, 400);
  }
  const status = (body as { status?: unknown }).status;
  if (status !== "active" && status !== "disabled") {
    return json({ error: "invalid_status" }, 400);
  }

  const provider = listProviders(db).find((p) => p.id === Number(idRaw));
  if (!provider) return json({ error: "not_found" }, 404);

  setProviderStatus(db, provider.name, status as ProviderStatus);
  const updated = listProviders(db).find((p) => p.id === Number(idRaw))!;
  return json({ provider: toPublicProvider(updated) });
}

export async function handlePutRouterRoute(
  db: Database,
  aliasRaw: string,
  req: Request,
): Promise<Response> {
  const alias = decodeAlias(aliasRaw);
  if (alias.length === 0) return json({ error: "invalid_alias" }, 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const chain =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as { fallback_chain?: unknown }).fallback_chain
      : undefined;
  if (!Array.isArray(chain) || chain.length === 0 || !chain.every(isValidHop)) {
    return json({ error: "invalid_chain" }, 400);
  }

  const hops: ModelRouteHop[] = chain.map((hop) => ({
    provider: hop.provider,
    model: hop.model,
  }));
  upsertModelRoute(db, alias, hops);
  const route = getModelRoute(db, alias)!;
  return json({ route: toPublicRoute(route) });
}
