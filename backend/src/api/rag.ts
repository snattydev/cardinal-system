import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import { RAG_MODES, RagUpstreamError, searchWithCache } from "@cardinal/rag";
import type { RagFetch, RagMode, RagResult } from "@cardinal/rag";

interface RagHandlerOpts {
  baseUrl?: string;
  token?: string;
  fetchImpl?: RagFetch;
  vaultScopes?: string[];
  denyPrefixes?: readonly string[];
}

const PERSONAL_OPT_IN_SCOPE = "vault:allow-personal";

function matchSegment(pattern: string, value: string): boolean {
  let pi = 0;
  let vi = 0;
  let starIdx = -1;
  let matchIdx = 0;

  while (vi < value.length) {
    if (pi < pattern.length && (pattern[pi] === "?" || pattern[pi] === value[vi])) {
      pi += 1;
      vi += 1;
    } else if (pi < pattern.length && pattern[pi] === "*") {
      starIdx = pi;
      matchIdx = vi;
      pi += 1;
    } else if (starIdx !== -1) {
      pi = starIdx + 1;
      matchIdx += 1;
      vi = matchIdx;
    } else {
      return false;
    }
  }

  while (pi < pattern.length && pattern[pi] === "*") {
    pi += 1;
  }
  return pi === pattern.length;
}

function matchGlob(pattern: string, targetPath: string): boolean {
  const cleanPattern = pattern.replace(/^\/+|\/+$/g, "");
  const cleanTarget = targetPath.replace(/^\/+|\/+$/g, "");
  if (cleanPattern === "") return false;

  const patSegs = cleanPattern.split("/");
  const pathSegs = cleanTarget === "" ? [] : cleanTarget.split("/");
  const pLen = patSegs.length;
  const sLen = pathSegs.length;

  const dp: boolean[][] = Array.from({ length: pLen + 1 }, () =>
    Array.from({ length: sLen + 1 }, () => false),
  );
  dp[0]![0] = true;

  for (let i = 1; i <= pLen; i += 1) {
    if (patSegs[i - 1] === "**") {
      dp[i]![0] = dp[i - 1]![0]!;
    }
  }

  for (let i = 1; i <= pLen; i += 1) {
    const pSeg = patSegs[i - 1]!;
    for (let j = 1; j <= sLen; j += 1) {
      if (pSeg === "**") {
        dp[i]![j] = dp[i - 1]![j]! || dp[i]![j - 1]!;
      } else {
        dp[i]![j] = dp[i - 1]![j - 1]! && matchSegment(pSeg, pathSegs[j - 1]!);
      }
    }
  }

  return dp[pLen]![sLen]!;
}

function normalizeVaultRelPath(rawPath: string): string | null {
  if (typeof rawPath !== "string" || rawPath.includes("\0") || rawPath.includes("\\")) {
    return null;
  }
  let rel = rawPath.trim();
  if (rel.startsWith("/data/vaults/")) {
    rel = rel.slice("/data/vaults/".length);
  }
  rel = rel.replace(/^\/+/, "");
  if (rel === "") return null;

  const segments = rel.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === ".." || seg.startsWith(".")) {
      return null;
    }
  }
  return segments.join("/");
}

function resolveDenyPrefixes(explicit?: readonly string[]): string[] {
  const raw = explicit ?? (process.env.CARDINAL_DENY_PREFIXES ?? "personal").split(",");
  return raw
    .map((p) => p.trim().replace(/^\/+|\/+$/g, "").toLowerCase())
    .filter((p) => p.length > 0);
}

function matchesExplicitReadScope(scopes: readonly string[], relPath: string): boolean {
  for (const scope of scopes) {
    if (scope.startsWith("vault:read:")) {
      const glob = scope.slice("vault:read:".length);
      if (matchGlob(glob, relPath)) return true;
      continue;
    }
    if (!scope.startsWith("vault:")) continue;
    const rest = scope.slice("vault:".length);
    if (rest === "" || rest === "allow-personal" || rest.startsWith("write:")) {
      continue;
    }
    const cleanVault = rest.replace(/^\/+|\/+$/g, "");
    if (cleanVault !== "" && (relPath === cleanVault || relPath.startsWith(`${cleanVault}/`))) {
      return true;
    }
  }
  return false;
}

function filterResultsByVaultScopes(
  results: RagResult[],
  vaultScopes?: string[],
  denyPrefixes?: readonly string[],
): RagResult[] {
  if (vaultScopes === undefined) return results;
  const denied = resolveDenyPrefixes(denyPrefixes);
  const allowPersonal = vaultScopes.includes(PERSONAL_OPT_IN_SCOPE);
  const allowAllNonDenied = vaultScopes.includes("*");

  return results.filter((r) => {
    const relPath = normalizeVaultRelPath(r.path);
    if (relPath === null) return false;
    const lower = relPath.toLowerCase();
    const isDenied = denied.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`));
    if (isDenied) {
      return allowPersonal && matchesExplicitReadScope(vaultScopes, relPath);
    }
    return allowAllNonDenied || matchesExplicitReadScope(vaultScopes, relPath);
  });
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
      results: filterResultsByVaultScopes(result.results, opts.vaultScopes, opts.denyPrefixes),
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
