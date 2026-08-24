export { deriveKey, encryptSecret, decryptSecret, maskSecret } from "./crypto";

export const KEY_PREFIX = "sk-cardinal-";

export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return KEY_PREFIX + hex;
}

export function hashKey(key: string): string {
  return new Bun.CryptoHasher("sha256").update(key).digest("hex");
}

export function isKeyFormat(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.startsWith(KEY_PREFIX) &&
    key.length === KEY_PREFIX.length + 64
  );
}
