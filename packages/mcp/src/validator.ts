import type { KeyIdentity } from "./auth";

/** Firma mínima de fetch, inyectable para tests (el fetch de Bun tiene extras). */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface ValidatorOptions {
  fetchImpl?: FetchLike;
  /** TTL de la cache en memoria (default 60s). */
  ttlMs?: number;
  /** Inyectable para tests. */
  now?: () => number;
}

interface CacheEntry {
  identity: KeyIdentity | null;
  expiresAt: number;
}

/**
 * Valida agent keys contra el endpoint interno del backend
 * (POST {CARDINAL_BACKEND_URL}/api/internal/keys/validate) con cache
 * en memoria por key y TTL (default 60s). Falla cerrado: cualquier
 * error de red o respuesta no-200/401 devuelve null.
 */
export function createValidator(backendUrl: string, options: ValidatorOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, CacheEntry>();

  return async function validate(key: string): Promise<KeyIdentity | null> {
    const cached = cache.get(key);
    if (cached !== undefined && now() < cached.expiresAt) {
      return cached.identity;
    }

    let identity: KeyIdentity | null = null;
    try {
      const res = await fetchImpl(`${backendUrl}/api/internal/keys/validate`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}` },
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
