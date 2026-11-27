import type { KeyIdentity } from "./auth";

/** Firma mínima de fetch, inyectable para tests (el fetch de Bun tiene extras). */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface ValidatorOptions {
  fetchImpl?: FetchLike;
  /** In-memory cache TTL in ms (default 60s). */
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Optional shared secret sent via x-cardinal-internal-secret. */
  internalServiceSecret?: string;
}

interface CacheEntry {
  identity: KeyIdentity | null;
  expiresAt: number;
}

/**
 * Validates agent keys against the backend internal endpoint
 * (POST {CARDINAL_BACKEND_URL}/api/internal/keys/validate) with in-memory
 * per-key TTL caching (default 60s). Fails closed: network errors or non-200/401
 * responses return null without caching.
 */
export function createValidator(backendUrl: string, options: ValidatorOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? (() => Date.now());
  const internalSecret = options.internalServiceSecret?.trim() || undefined;
  const cache = new Map<string, CacheEntry>();

  return async function validate(key: string): Promise<KeyIdentity | null> {
    const cached = cache.get(key);
    if (cached !== undefined && now() < cached.expiresAt) {
      return cached.identity;
    }

    let identity: KeyIdentity | null = null;
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${key}` };
      if (internalSecret) {
        headers["x-cardinal-internal-secret"] = internalSecret;
      }
      const res = await fetchImpl(`${backendUrl}/api/internal/keys/validate`, {
        method: "POST",
        headers,
      });
      if (res.status === 200) {
        const body = (await res.json()) as Partial<KeyIdentity>;
        if (
          typeof body.agent === "string" &&
          typeof body.kind === "string" &&
          Array.isArray(body.scopes) &&
          body.scopes.every((s) => typeof s === "string")
        ) {
          identity = { agent: body.agent, kind: body.kind, scopes: body.scopes };
        }
      } else if (res.status !== 401) {
        // 5xx / inesperado: no cachear un resultado dudoso como válido.
        return null;
      }
    } catch {
      return null; // fail closed
    }

    cache.set(key, { identity, expiresAt: now() + ttlMs });
    return identity;
  };
}
