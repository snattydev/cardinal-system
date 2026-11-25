export {
  AclPathError,
  DEFAULT_DENY_PREFIXES,
  PERSONAL_OPT_IN_SCOPE,
  canReadAnyVault,
  canReadConfig,
  canReadConfigCategory,
  canReadPath,
  canWritePath,
  canWritePrefix,
  hasServiceScope,
  isDeniedPath,
  matchGlob,
  normalizePrefix,
  normalizeRelativePath,
  type AclConfig,
  type ConfigCategory,
  type KeyIdentity,
} from "./acl";
import { canReadPath, type AclConfig } from "./acl";

/**
 * Legacy helper retained for vault-level allowlist inspection.
 */
export function allowedVaults(
  scopes: string[],
  knownVaults: readonly string[],
  config?: AclConfig,
): Set<string> {
  const out = new Set<string>();
  for (const vault of knownVaults) {
    if (canReadPath(scopes, `${vault}/__probe__.md`, config)) {
      out.add(vault);
    }
  }
  return out;
}

export function canAccessVault(
  scopes: string[],
  vault: string,
  knownVaults: readonly string[],
  config?: AclConfig,
): boolean {
  return allowedVaults(scopes, knownVaults, config).has(vault);
}
