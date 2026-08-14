import type { Database } from "bun:sqlite";

export type RagMode = "hybrid" | "semantic" | "keyword";
export const RAG_MODES: RagMode[] = ["hybrid", "semantic", "keyword"];

export interface RagResult {
  path: string;
  score: number;
  content: string;
  source: string;
}

export interface RagSearchResult {
  results: RagResult[];
  cached: boolean;
  cached_at?: string;
}

export interface SearchWithCacheOpts {
  query: string;
  top_k?: number;
  mode?: RagMode;
  baseUrl?: string;
  token?: string;
  fetchImpl?: RagFetch;
}

export type RagFetch = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_BASE_URL = "http://host.containers.internal:8788";
const CACHE_TTL = "-1 hour";
const CACHE_MAX_ROWS = 1000;

export class RagUpstreamError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = "RagUpstreamError";
    this.detail = detail;
  }
}

export function normalizeResults(raw: unknown[]): RagResult[] {
  const results: RagResult[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const file_path = r.file_path;
    const body = r.content;
    if (typeof file_path !== "string" || typeof body !== "string") continue;
    const heading = typeof r.heading === "string" ? r.heading : "";
    const score =
      typeof r.rrf_score === "number" ? r.rrf_score : typeof r.score === "number" ? r.score : 0;
    results.push({
      path: file_path,
      score,
      content: heading ? `${heading}\n\n${body}` : body,
      source: "vault",
    });
  }
  return results;
}

async function cacheKey(query: string, top_k: number, mode: RagMode): Promise<string> {
  const data = new TextEncoder().encode(`${mode}\u0000${top_k}\u0000${query}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getCached(
  db: Database,
  query: string,
  top_k: number,
  mode: RagMode = "hybrid",
): Promise<{ results: RagResult[]; cached_at: string } | null> {
  const key = await cacheKey(query, top_k, mode);
  const row = db
    .query(
      `SELECT results, created_at FROM rag_cache
       WHERE cache_key = ? AND created_at > datetime('now', ?)`,
    )
    .get(key, CACHE_TTL) as { results: string; created_at: string } | null;
  if (!row) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.results);
  } catch {
    return null;
  }
  return { results: parsed as RagResult[], cached_at: row.created_at };
}

export async function putCached(
  db: Database,
  query: string,
  top_k: number,
  resultsJson: string,
  mode: RagMode = "hybrid",
): Promise<void> {
  const key = await cacheKey(query, top_k, mode);
  db.run(
    `INSERT INTO rag_cache (cache_key, query, top_k, results) VALUES (?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       query = excluded.query,
       top_k = excluded.top_k,
       results = excluded.results,
       created_at = datetime('now')`,
    [key, query, top_k, resultsJson],
  );
  db.run(
    `DELETE FROM rag_cache WHERE cache_key NOT IN (
       SELECT cache_key FROM rag_cache ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
    [CACHE_MAX_ROWS],
  );
}

export async function searchWithCache(db: Database, opts: SearchWithCacheOpts): Promise<RagSearchResult> {
  const top_k = opts.top_k ?? 5;
  const mode = opts.mode ?? "hybrid";
  const baseUrl = opts.baseUrl ?? process.env.VAULT_PROXY_URL ?? DEFAULT_BASE_URL;
  const token = opts.token ?? process.env.VAULT_PROXY_TOKEN ?? "";
  const fetchImpl = opts.fetchImpl ?? fetch;

  const cached = await getCached(db, opts.query, top_k, mode);
  if (cached) {
    return { results: cached.results, cached: true, cached_at: cached.cached_at };
  }

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/search`, {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        ...(token ? { "x-vault-token": token } : {}),
      }),
      body: JSON.stringify({ query: opts.query, top_k, mode }),
    });
  } catch (err) {
    throw new RagUpstreamError(err instanceof Error ? err.message : String(err));
  }

  if (!res.ok) {
    let detail = `upstream returned ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {}
    throw new RagUpstreamError(detail);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    throw new RagUpstreamError(err instanceof Error ? err.message : String(err));
  }

  const raw = (payload as { results?: unknown }).results;
  const results = normalizeResults(Array.isArray(raw) ? raw : []);
  await putCached(db, opts.query, top_k, JSON.stringify(results), mode);
  return { results, cached: false };
}
