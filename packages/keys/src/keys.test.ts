import { describe, expect, test } from "bun:test";
import { generateKey, hashKey, isKeyFormat, KEY_PREFIX } from "./index";

describe("generateKey", () => {
  test("returns sk-cardinal- prefix plus 64 hex chars", () => {
    const key = generateKey();
    expect(typeof key).toBe("string");
    expect(key.startsWith("sk-cardinal-")).toBe(true);
    expect(key.length).toBe(12 + 64);
    expect(/^[0-9a-f]{64}$/.test(key.slice(KEY_PREFIX.length))).toBe(true);
  });

  test("two calls produce different keys", () => {
    expect(generateKey()).not.toBe(generateKey());
  });
});

describe("hashKey", () => {
  test("is deterministic and returns 64-char hex", () => {
    const key = generateKey();
    const h1 = hashKey(key);
    expect(h1).toBe(hashKey(key));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different keys produce different hashes", () => {
    expect(hashKey(generateKey())).not.toBe(hashKey(generateKey()));
  });
});

describe("isKeyFormat", () => {
  test("accepts a generated key", () => {
    expect(isKeyFormat(generateKey())).toBe(true);
  });

  test("rejects a short suffix", () => {
    expect(isKeyFormat("sk-cardinal-short")).toBe(false);
  });

  test("rejects a wrong prefix", () => {
    const key = generateKey();
    expect(isKeyFormat("sk-other-" + key.slice(KEY_PREFIX.length))).toBe(false);
  });

  test("rejects non-strings", () => {
    expect(isKeyFormat(42)).toBe(false);
    expect(isKeyFormat(null)).toBe(false);
    expect(isKeyFormat(undefined)).toBe(false);
  });
});
