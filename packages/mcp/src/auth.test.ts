import { describe, expect, test } from "bun:test";
import { allowedVaults, canAccessVault, PERSONAL_OPT_IN_SCOPE } from "./auth";

const VAULTS = ["portal", "agents", "personal"] as const;

describe("allowedVaults compatibility helpers", () => {
  test('scope "*" grants known non-denied vaults while excluding personal/**', () => {
    expect(allowedVaults(["*"], VAULTS)).toEqual(new Set(["portal", "agents"]));
  });

  test('scopes "vault:<name>" and "vault:read:<glob>" enforce allowlist', () => {
    expect(allowedVaults(["vault:portal"], VAULTS)).toEqual(new Set(["portal"]));
    expect(allowedVaults(["vault:read:portal/**"], VAULTS)).toEqual(new Set(["portal"]));
    expect(
      allowedVaults(["vault:portal", "vault:personal", PERSONAL_OPT_IN_SCOPE], VAULTS),
    ).toEqual(new Set(["portal", "personal"]));
  });

  test("unknown or non-vault scopes produce an empty set", () => {
    expect(allowedVaults([], VAULTS).size).toBe(0);
    expect(allowedVaults(["board:read"], VAULTS).size).toBe(0);
    expect(allowedVaults(["vault:nope"], VAULTS).size).toBe(0);
  });
});

describe("canAccessVault", () => {
  test("enforces vault visibility and personal opt-in", () => {
    expect(canAccessVault(["*"], "portal", VAULTS)).toBe(true);
    expect(canAccessVault(["*"], "personal", VAULTS)).toBe(false);
    expect(canAccessVault(["vault:portal"], "portal", VAULTS)).toBe(true);
    expect(canAccessVault(["vault:portal"], "agents", VAULTS)).toBe(false);
  });
});
