import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { RAG_MODES, RagUpstreamError, searchWithCache } from "@cardinal/rag";
import type { RagFetch, RagMode, RagResult } from "@cardinal/rag";

interface RagHandlerOpts {
  baseUrl?: string;
  token?: string;
  fetchImpl?: RagFetch;
  vaultScopes?: string[];
}

function filterResultsByVaultScopes(results: RagResult[], vaultScopes?: string[]): RagResult[] {
  if (vaultScopes === undefined) return results;
  if (vaultScopes.includes("*")) return results;
  const vaults: string[] = [];
  for (const scope of vaultScopes) {
    if (scope.startsWith("vault:")) vaults.push(scope.slice("vault:".length));
  }
  if (vaults.length === 0) return [];
  return results.filter((r) => vaults.some((vault) => r.path.includes(`/${vault}/`)));
}

export async function handleRagSearch(
  db: Database,
  req: Request,
  opts: RagHandlerOpts = {},
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;

  if (typeof raw.query !== "string" || raw.query.trim() === "") {
    return json({ error: "missing_query" }, 400);
  }
  const query = raw.query.trim();

  let top_k = 5;
  if (raw.top_k !== undefined) {
    const n = typeof raw.top_k === "number" ? raw.top_k : Number(raw.top_k);
    if (Number.isFinite(n)) {
      top_k = Math.max(1, Math.min(10, Math.floor(n)));
    }
  }

  let mode: RagMode = "hybrid";
  if (raw.mode !== undefined) {
    if (typeof raw.mode !== "string" || !RAG_MODES.includes(raw.mode as RagMode)) {
      return json({ error: "invalid_mode" }, 400);
    }
    mode = raw.mode as RagMode;
  }

  try {
    const result = await searchWithCache(db, {
      query,
      top_k,
      mode,
      baseUrl: opts.baseUrl,
      token: opts.token,
      fetchImpl: opts.fetchImpl,
    });
    const payload: { results: RagResult[]; cached: boolean; cached_at?: string } = {
      results: filterResultsByVaultScopes(result.results, opts.vaultScopes),
      cached: result.cached,
    };
    if (result.cached_at) payload.cached_at = result.cached_at;
    return json(payload);
  } catch (err) {
    if (err instanceof RagUpstreamError) {
      return json({ error: "rag_upstream_error", detail: err.detail }, 502);
    }
    throw err;
  }
}
