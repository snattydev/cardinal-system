import type { Database } from "bun:sqlite";
import type { ModelRouteHop, ProviderRow } from "@cardinal/db";
import { getModelRoute, getProviderByName } from "@cardinal/db";
import { RouterError } from "./error";

export interface ResolvedHop {
  providerId: number;
  providerName: string;
  baseUrl: string;
  apiKeyEnc: string | null;
  wireFormat: string;
  modelId: string;
}

function isUsableProvider(provider: ProviderRow): boolean {
  return provider.status === "active" && provider.base_url.length > 0;
}

function parseFallbackChain(raw: string): ModelRouteHop[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const hops: ModelRouteHop[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const hop = item as Record<string, unknown>;
    if (typeof hop.provider !== "string" || typeof hop.model !== "string") continue;
    hops.push({ provider: hop.provider, model: hop.model });
  }
  return hops;
}

function toHop(provider: ProviderRow, modelId: string): ResolvedHop {
  return {
    providerId: provider.id,
    providerName: provider.name,
    baseUrl: provider.base_url,
    apiKeyEnc: provider.api_key_enc,
    wireFormat: provider.wire_format,
    modelId,
  };
}

interface AutorouterRow {
  provider_id: number;
  provider_name: string;
  base_url: string;
  api_key_enc: string | null;
  wire_format: string;
  model_id: string;
}

export async function resolveModelChain(db: Database, model: string): Promise<ResolvedHop[]> {
  const route = getModelRoute(db, model);
  if (route !== null) {
    const chain: ResolvedHop[] = [];
    for (const hop of parseFallbackChain(route.fallback_chain)) {
      const provider = getProviderByName(db, hop.provider);
      if (provider === null || !isUsableProvider(provider)) continue;
      chain.push(toHop(provider, hop.model));
    }
    if (chain.length === 0) throw new RouterError("model_not_found");
    return chain;
  }

  const rows = db
    .query(
      `SELECT p.id AS provider_id, p.name AS provider_name, p.base_url, p.api_key_enc,
              p.wire_format, pm.model_id
       FROM provider_models pm
       JOIN providers p ON p.id = pm.provider_id
       WHERE pm.model_id = ? AND p.status = 'active' AND length(p.base_url) > 0
       ORDER BY p.id ASC`,
    )
    .all(model) as AutorouterRow[];

  const chain: ResolvedHop[] = rows.map((row) => ({
    providerId: row.provider_id,
    providerName: row.provider_name,
    baseUrl: row.base_url,
    apiKeyEnc: row.api_key_enc,
    wireFormat: row.wire_format,
    modelId: row.model_id,
  }));

  if (chain.length === 0) throw new RouterError("model_not_found");
  return chain;
}
