import { describe, expect, test } from "bun:test";
import { decryptSecret, deriveKey, encryptSecret, maskSecret } from "./crypto";

const POOL = "test-pool-secret";
const PLAIN = "sk-live-provider-key-abcd";

describe("deriveKey", () => {
  test("returns 32 bytes from SHA-256 of the secret", () => {
    const key = deriveKey(POOL);
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
    expect(key.equals(deriveKey(POOL))).toBe(true);
  });
});

describe("encryptSecret / decryptSecret", () => {
  test("roundtrip restores the original secret", () => {
    const payload = encryptSecret(PLAIN, POOL);
    expect(decryptSecret(payload, POOL)).toBe(PLAIN);
  });

  test("decrypt with the wrong pool secret throws", () => {
    const payload = encryptSecret(PLAIN, POOL);
    expect(() => decryptSecret(payload, "other-secret")).toThrow();
  });

  test("tampered ciphertext throws", () => {
    const payload = encryptSecret(PLAIN, POOL);
    const buf = Buffer.from(payload, "base64");
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff;
    expect(() => decryptSecret(buf.toString("base64"), POOL)).toThrow();
  });

  test("rejects a payload shorter than the iv and auth tag", () => {
    expect(() => decryptSecret("", POOL)).toThrow("invalid payload");
    expect(() => decryptSecret(Buffer.alloc(27).toString("base64"), POOL)).toThrow("invalid payload");
  });

  test("same plaintext produces different ciphertext because IV is random", () => {
    const a = encryptSecret(PLAIN, POOL);
    const b = encryptSecret(PLAIN, POOL);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, POOL)).toBe(PLAIN);
    expect(decryptSecret(b, POOL)).toBe(PLAIN);
  });
});

describe("maskSecret", () => {
  test("shows only the last 4 characters", () => {
    expect(maskSecret("sk-live-provider-key-abcd")).toBe("sk-****abcd");
  });
});
