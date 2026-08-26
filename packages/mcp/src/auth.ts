export { generateKey, hashKey, isKeyFormat, KEY_PREFIX } from "@cardinal/keys";

/** Resultado de validar una agent key contra el backend. */
export interface KeyIdentity {
  agent: string;
  kind: string;
  scopes: string[];
}

/**
 * Interpreta los scopes de una key como allowlist de vaults.
 * - Scope "*" → todas las vaults permitidas.
 * - Scope "vault:<name>" → permite esa vault.
 * - Vault pedida que no está en CARDINAL_VAULTS → nunca permitida salvo "*".
 *   (el caller decide: para vaults desconocidas, "*" no autoriza leerlas porque
 *   no existen en el filesystem; el check de existencia lo hace la tool.)
 */
export function allowedVaults(scopes: string[], knownVaults: readonly string[]): Set<string> {
  if (scopes.includes("*")) return new Set(knownVaults);
  const vaults = new Set<string>();
  for (const scope of scopes) {
    if (scope.startsWith("vault:")) vaults.add(scope.slice("vault:".length));
  }
  return vaults;
}

export function canAccessVault(scopes: string[], vault: string, knownVaults: readonly string[]): boolean {
  return allowedVaults(scopes, knownVaults).has(vault);
}
