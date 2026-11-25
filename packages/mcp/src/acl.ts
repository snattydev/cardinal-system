export const DEFAULT_DENY_PREFIXES = ["personal"] as const;
export const PERSONAL_OPT_IN_SCOPE = "vault:allow-personal";

export interface AclConfig {
  denyPrefixes?: readonly string[];
}

export interface KeyIdentity {
  agent: string;
  kind: string;
  scopes: string[];
}

export class AclPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AclPathError";
  }
}

const ENCODED_TRAVERSAL_RE = /%(?:2e|2f|5c|00)/i;
const DRIVE_PREFIX_RE = /^[a-zA-Z]:/;

/**
 * Normalizes a vault-relative POSIX path and rejects traversal, backslashes,
 * null bytes, URL-encoded traversal tokens, drive prefixes, and hidden segments.
 */
export function normalizeRelativePath(raw: string): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new AclPathError("invalid path: empty");
  }
  if (raw !== raw.trim()) {
    throw new AclPathError("invalid path: surrounding whitespace");
  }
  if (raw.includes("\0") || raw.includes("\\")) {
    throw new AclPathError("invalid path: forbidden character");
  }
  if (ENCODED_TRAVERSAL_RE.test(raw)) {
    throw new AclPathError("invalid path: encoded traversal token");
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new AclPathError("invalid path: malformed encoding");
  }

  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    ENCODED_TRAVERSAL_RE.test(decoded) ||
    decoded.startsWith("/") ||
    decoded.startsWith("~") ||
    DRIVE_PREFIX_RE.test(decoded)
  ) {
    throw new AclPathError("invalid path: traversal or absolute path blocked");
  }

  const segments = decoded.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === ".." || seg.startsWith(".")) {
      throw new AclPathError("invalid path: forbidden segment");
    }
  }

  return segments.join("/");
}

/**
 * Normalizes an optional directory prefix (empty string allowed).
 */
export function normalizePrefix(raw?: string): string {
  if (raw === undefined) return "";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return normalizeRelativePath(trimmed);
}

/**
 * Linear two-pointer wildcard matcher within a single path segment (* and ?).
 * Avoids regex backtracking / ReDoS.
 */
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

/**
 * Deterministic segment-based glob matcher supporting "**" (0+ segments),
 * "*" (0+ chars within a segment), and "?" (1 char within a segment).
 */
export function matchGlob(pattern: string, targetPath: string): boolean {
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

function resolveDenyPrefixes(config?: AclConfig): string[] {
  const raw = config?.denyPrefixes ?? DEFAULT_DENY_PREFIXES;
  const out: string[] = [];
  for (const item of raw) {
    const clean = item.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
    if (clean.length > 0) out.push(clean);
  }
  return out;
}

export function isDeniedPath(relPath: string, config?: AclConfig): boolean {
  let normalized: string;
  try {
    normalized = normalizeRelativePath(relPath).toLowerCase();
  } catch {
    return true;
  }
  const denyPrefixes = resolveDenyPrefixes(config);
  return denyPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

function isLegacyVaultScope(scope: string): string | null {
  if (!scope.startsWith("vault:")) return null;
  const rest = scope.slice("vault:".length);
  if (
    rest === "" ||
    rest === "allow-personal" ||
    rest.startsWith("read:") ||
    rest.startsWith("write:")
  ) {
    return null;
  }
  return rest.replace(/^\/+|\/+$/g, "");
}

function matchExplicitReadScope(scopes: readonly string[], cleanPath: string): boolean {
  for (const scope of scopes) {
    if (scope.startsWith("vault:read:")) {
      const glob = scope.slice("vault:read:".length);
      if (matchGlob(glob, cleanPath)) return true;
      continue;
    }
    const legacy = isLegacyVaultScope(scope);
    if (legacy !== null && matchGlob(`${legacy}/**`, cleanPath)) {
      return true;
    }
  }
  return false;
}

export function canReadPath(
  scopes: readonly string[],
  relPath: string,
  config?: AclConfig,
): boolean {
  let cleanPath: string;
  try {
    cleanPath = normalizeRelativePath(relPath);
  } catch {
    return false;
  }

  if (isDeniedPath(cleanPath, config)) {
    if (!scopes.includes(PERSONAL_OPT_IN_SCOPE)) {
      return false;
    }
    return matchExplicitReadScope(scopes, cleanPath);
  }

  if (scopes.includes("*")) return true;
  return matchExplicitReadScope(scopes, cleanPath);
}

export function canWritePath(
  scopes: readonly string[],
  relPath: string,
  config?: AclConfig,
): boolean {
  let cleanPath: string;
  try {
    cleanPath = normalizeRelativePath(relPath);
  } catch {
    return false;
  }

  if (isDeniedPath(cleanPath, config)) {
    return false;
  }

  for (const scope of scopes) {
    if (scope.startsWith("vault:write:")) {
      const glob = scope.slice("vault:write:".length);
      if (matchGlob(glob, cleanPath)) return true;
    }
  }
  return false;
}

function globTargetsOnlyDeniedPrefix(glob: string, denyPrefixes: string[]): boolean {
  const clean = glob.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  if (clean === "") return true;
  return denyPrefixes.some((p) => clean === p || clean.startsWith(`${p}/`));
}

export function canReadAnyVault(scopes: readonly string[], config?: AclConfig): boolean {
  if (scopes.includes("*")) return true;
  const denyPrefixes = resolveDenyPrefixes(config);
  const hasOptIn = scopes.includes(PERSONAL_OPT_IN_SCOPE);

  for (const scope of scopes) {
    if (scope.startsWith("vault:read:")) {
      const glob = scope.slice("vault:read:".length).trim();
      if (glob.length === 0) continue;
      if (!globTargetsOnlyDeniedPrefix(glob, denyPrefixes) || hasOptIn) return true;
    }
    const legacy = isLegacyVaultScope(scope);
    if (legacy !== null) {
      if (!globTargetsOnlyDeniedPrefix(legacy, denyPrefixes) || hasOptIn) return true;
    }
  }
  return false;
}

export function canWritePrefix(
  scopes: readonly string[],
  prefix: string,
  config?: AclConfig,
): boolean {
  let cleanPrefix: string;
  try {
    cleanPrefix = normalizePrefix(prefix);
  } catch {
    return false;
  }
  if (cleanPrefix === "" || isDeniedPath(cleanPrefix, config)) return false;

  for (const scope of scopes) {
    if (!scope.startsWith("vault:write:")) continue;
    const glob = scope.slice("vault:write:".length).replace(/^\/+|\/+$/g, "");
    if (glob === "") continue;
    if (
      glob === cleanPrefix ||
      glob.startsWith(`${cleanPrefix}/`) ||
      matchGlob(glob, `${cleanPrefix}/probe.md`)
    ) {
      return true;
    }
  }
  return false;
}

export function hasServiceScope(
  scopes: readonly string[],
  service: "board" | "mailbox",
): boolean {
  return (
    scopes.includes("*") ||
    scopes.includes(service) ||
    scopes.includes(`${service}:read`) ||
    scopes.includes(`${service}:write`)
  );
}

export type ConfigCategory = "agents" | "user";

/**
 * Checks read permission for sanitized host/agent config snapshots under
 * `agents/**` or `user/**`.
 *
 * Security boundary: `user/**` configs are strictly opt-in via an explicit
 * `config:read:user` or `config:read:user/<glob>` scope and are NEVER granted
 * by wildcard `*`, `config:read:*`, or `config:read:**`.
 */
export function canReadConfig(
  scopes: readonly string[],
  category: ConfigCategory,
  relPath: string,
): boolean {
  let cleanRel: string;
  try {
    cleanRel = normalizeRelativePath(relPath);
  } catch {
    return false;
  }

  const fullPath = `${category}/${cleanRel}`;

  if (category === "agents") {
    if (scopes.includes("*")) return true;
    for (const scope of scopes) {
      if (!scope.startsWith("config:read:")) continue;
      const glob = scope.slice("config:read:".length).trim().replace(/^\/+|\/+$/g, "");
      if (glob === "") continue;
      if (glob === "*" || glob === "**") return true;
      if (matchGlob(glob, fullPath)) return true;
    }
    return false;
  }

  for (const scope of scopes) {
    if (!scope.startsWith("config:read:")) continue;
    const glob = scope.slice("config:read:".length).trim().replace(/^\/+|\/+$/g, "");
    if (glob !== "user" && !glob.startsWith("user/")) continue;
    if (glob === "user") return true;
    if (matchGlob(glob, fullPath)) return true;
  }
  return false;
}

/**
 * Returns true if the caller can list or read at least one path in the given config category.
 */
export function canReadConfigCategory(
  scopes: readonly string[],
  category: ConfigCategory,
): boolean {
  if (category === "agents") {
    if (scopes.includes("*")) return true;
    for (const scope of scopes) {
      if (!scope.startsWith("config:read:")) continue;
      const glob = scope.slice("config:read:".length).trim().replace(/^\/+|\/+$/g, "");
      if (glob === "*" || glob === "**" || glob === "agents" || glob.startsWith("agents/")) {
        return true;
      }
    }
    return false;
  }

  for (const scope of scopes) {
    if (!scope.startsWith("config:read:")) continue;
    const glob = scope.slice("config:read:".length).trim().replace(/^\/+|\/+$/g, "");
    if (glob === "user" || glob.startsWith("user/")) return true;
  }
  return false;
}
