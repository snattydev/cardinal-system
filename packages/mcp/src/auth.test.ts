import { describe, expect, test } from "bun:test";
import { allowedVaults, canAccessVault } from "./auth";

const VAULTS = ["the portal", "for-my-agents"] as const;

describe("allowedVaults", () => {
  test('scope "*" → todas las vaults conocidas', () => {
    expect(allowedVaults(["*"], VAULTS)).toEqual(new Set(VAULTS));
  });

  test('scopes "vault:<name>" → allowlist exacta', () => {
    expect(allowedVaults(["vault:the portal"], VAULTS)).toEqual(new Set(["the portal"]));
    expect(allowedVaults(["vault:the portal", "vault:for-my-agents"], VAULTS)).toEqual(new Set(VAULTS));
  });

  test('scope "vault:x" no conocida → set con x (403 al pedir vaults reales distintas)', () => {
    const set = allowedVaults(["vault:nope"], VAULTS);
    expect(set.has("nope")).toBe(true);
    expect(set.has("the portal")).toBe(false);
  });

  test("sin scopes de vault → vacío", () => {
    expect(allowedVaults([], VAULTS).size).toBe(0);
    expect(allowedVaults(["fast"], VAULTS).size).toBe(0);
  });
});

describe("canAccessVault", () => {
  test('"*" permite cualquier vault conocida', () => {
    expect(canAccessVault(["*"], "the portal", VAULTS)).toBe(true);
    expect(canAccessVault(["*"], "for-my-agents", VAULTS)).toBe(true);
  });

  test("allowlist limita", () => {
    expect(canAccessVault(["vault:the portal"], "the portal", VAULTS)).toBe(true);
    expect(canAccessVault(["vault:the portal"], "for-my-agents", VAULTS)).toBe(false);
  });
});
