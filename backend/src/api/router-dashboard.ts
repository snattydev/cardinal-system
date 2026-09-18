import type { Database } from "bun:sqlite";
import type { ModelRouteRow, ProviderModelRow, ProviderRow, ProviderStatus, WireFormat } from "@cardinal/core";
import { json } from "@cardinal/core";
import type { ModelRouteHop } from "@cardinal/db";
import {
  deleteProvider,
  getModelRoute,
  getProviderById,
  getProviderByName,
  listModelRoutes,
  listProviderModels,
  listProviders,
  replaceProviderModels,
  updateProviderConfig,
  upsertModelRoute,
  upsertProvider,
} from "@cardinal/db";
import { decryptSecret, encryptSecret } from "@cardinal/keys";
import { fetchProviderModels, ModelFetchError } from "@cardinal/router";

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

export type CatalogKind = "model" | "alias" | "fusion";

export type CatalogItem = { id: string; kind: CatalogKind };

function classifyRouteChain(raw: string): Exclude<CatalogKind, "model"> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return "alias";
  if (parsed !== null && typeof parsed === "object" && "mode" in parsed && parsed.mode === "fusion") {
    return "fusion";
  }
  return null;
}

export function handleListRouterCatalog(db: Database): Response {
  const items: CatalogItem[] = [];
  const seen = new Set<string>();

  for (const provider of listProviders(db)) {
    if (provider.status !== "active") continue;
    for (const model of listProviderModels(db, provider.id)) {
      if (seen.has(model.model_id)) continue;
      seen.add(model.model_id);
      items.push({ id: model.model_id, kind: "model" });
    }
  }

  for (const route of listModelRoutes(db)) {
    if (seen.has(route.alias)) continue;
    const kind = classifyRouteChain(route.fallback_chain);
    if (kind === null) continue;
    seen.add(route.alias);
    items.push({ id: route.alias, kind });
  }

  return json({ items });
}

const WIRE_FORMATS: WireFormat[] = ["openai", "anthropic", "gemini"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function providerApiKey(provider: ProviderRow, poolSecret: string): string | null {
  if (provider.api_key_enc === null || provider.api_key_enc.length === 0) return null;
  try {
    return decryptSecret(provider.api_key_enc, poolSecret);
  } catch {
    return null;
  }
}

async function syncProviderModels(
  db: Database,
  providerId: number,
  poolSecret: string,
): Promise<Response | null> {
  const provider = getProviderById(db, providerId);
  if (!provider) return json({ error: "not_found" }, 404);

  try {
    const modelIds = await fetchProviderModels(
      provider.base_url,
      providerApiKey(provider, poolSecret),
      provider.wire_format,
    );
    if (modelIds.length === 0) {
      return json({ error: "model_fetch_empty" }, 502);
    }
    replaceProviderModels(db, providerId, modelIds);
    return null;
  } catch (err) {
    const detail = err instanceof ModelFetchError ? err.message : "unknown";
    return json({ error: "model_fetch_failed", detail }, 502);
  }
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

  const syncError = await syncProviderModels(db, provider.id, poolSecret);
  if (syncError) {
    deleteProvider(db, provider.id);
    return syncError;
  }

  const synced = getProviderById(db, provider.id)!;
  return json({
    provider: toPublicProvider(synced),
    models: listProviderModels(db, provider.id).map(toPublicModel),
  });
}

export async function handlePatchRouterProvider(
  db: Database,
  idRaw: string,
  req: Request,
  poolSecret?: string,
): Promise<Response> {
  if (!/^\d+$/.test(idRaw)) return json({ error: "invalid_id" }, 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "invalid_payload" }, 400);
  }
  const payload = body as Record<string, unknown>;

  const provider = getProviderById(db, Number(idRaw));
  if (!provider) return json({ error: "not_found" }, 404);

  const config: Parameters<typeof updateProviderConfig>[2] = {};
  let hasUpdate = false;

  if (payload.status !== undefined) {
    if (payload.status !== "active" && payload.status !== "disabled") {
      return json({ error: "invalid_status" }, 400);
    }
    config.status = payload.status as ProviderStatus;
    hasUpdate = true;
  }

  if (payload.base_url !== undefined) {
    if (!isNonEmptyString(payload.base_url)) {
      return json({ error: "invalid_payload" }, 400);
    }
    config.baseUrl = payload.base_url.trim();
    hasUpdate = true;
  }

  if (payload.wire_format !== undefined) {
    if (
      typeof payload.wire_format !== "string" ||
      !WIRE_FORMATS.includes(payload.wire_format as WireFormat)
    ) {
      return json({ error: "invalid_payload" }, 400);
    }
    config.wireFormat = payload.wire_format as WireFormat;
    hasUpdate = true;
  }

  if (payload.cost_per_mtok !== undefined) {
    if (!isNonNegativeFinite(payload.cost_per_mtok)) {
      return json({ error: "invalid_payload" }, 400);
    }
    config.costPerMtok = payload.cost_per_mtok;
    hasUpdate = true;
  }

  if (payload.api_key !== undefined) {
    if (!isNonEmptyString(payload.api_key)) {
      return json({ error: "invalid_payload" }, 400);
    }
    if (!poolSecret) return json({ error: "server_misconfigured" }, 500);
    config.apiKeyEnc = encryptSecret(payload.api_key, poolSecret);
    hasUpdate = true;
  }

  let shouldSyncModels =
    payload.base_url !== undefined ||
    payload.wire_format !== undefined ||
    payload.api_key !== undefined ||
    payload.sync_models === true;

  if (payload.models !== undefined) {
    return json({ error: "invalid_payload" }, 400);
  }

  if (!hasUpdate && !shouldSyncModels) {
    return json({ error: "invalid_payload" }, 400);
  }

  if (hasUpdate) {
    updateProviderConfig(db, provider.id, config);
  }

  if (shouldSyncModels) {
    if (!poolSecret) return json({ error: "server_misconfigured" }, 500);
    const syncError = await syncProviderModels(db, provider.id, poolSecret);
    if (syncError) return syncError;
  }

  const updated = getProviderById(db, provider.id)!;
  return json({
    provider: toPublicProvider(updated),
    models: listProviderModels(db, provider.id).map(toPublicModel),
  });
}

export function handleDeleteRouterProvider(db: Database, idRaw: string): Response {
  if (!/^\d+$/.test(idRaw)) return json({ error: "invalid_id" }, 400);
  const id = Number(idRaw);
  if (!getProviderById(db, id)) return json({ error: "not_found" }, 404);
  deleteProvider(db, id);
  return json({ ok: true });
}

export async function handleSyncRouterProviderModels(
  db: Database,
  idRaw: string,
  poolSecret: string,
): Promise<Response> {
  if (!/^\d+$/.test(idRaw)) return json({ error: "invalid_id" }, 400);
  const id = Number(idRaw);
  if (!getProviderById(db, id)) return json({ error: "not_found" }, 404);

  const syncError = await syncProviderModels(db, id, poolSecret);
  if (syncError) return syncError;

  const updated = getProviderById(db, id)!;
  return json({
    provider: toPublicProvider(updated),
    models: listProviderModels(db, id).map(toPublicModel),
  });
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
