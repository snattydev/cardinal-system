import { describe, expect, test } from "bun:test";
import { createValidator } from "./validator";

const BACKEND = "http://backend:8787";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createValidator", () => {
  test("valid key → identity y llama al endpoint interno del backend", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: any, init?: any): Promise<Response> => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, { agent: "shinon", kind: "agent", scopes: ["*"] });
    };
    const validate = createValidator(BACKEND, { fetchImpl });
    const id = await validate("sk-cardinal-abc");
    expect(id).toEqual({ agent: "shinon", kind: "agent", scopes: ["*"] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BACKEND}/api/internal/keys/validate`);
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-cardinal-abc",
    );
  });

  test("401 desde backend → null", async () => {
    const fetchImpl = async (): Promise<Response> => jsonResponse(401, { error: "unauthorized" });
    const validate = createValidator(BACKEND, { fetchImpl });
    expect(await validate("sk-cardinal-bad")).toBeNull();
  });

  test("error de red → null (fail closed)", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error("connection refused");
    };
    const validate = createValidator(BACKEND, { fetchImpl });
    expect(await validate("sk-cardinal-x")).toBeNull();
  });

  test("cache: la misma key no repite el fetch dentro del TTL", async () => {
    let count = 0;
    const fetchImpl = async (): Promise<Response> => {
      count++;
      return jsonResponse(200, { agent: "a", kind: "agent", scopes: [] });
    };
    const validate = createValidator(BACKEND, { fetchImpl, ttlMs: 60_000 });
    await validate("k1");
    await validate("k1");
    await validate("k1");
    expect(count).toBe(1);
    await validate("k2");
    expect(count).toBe(2);
  });

  test("expiración de cache: después del TTL vuelve a llamar", async () => {
    let count = 0;
    const fetchImpl = async (): Promise<Response> => {
      count++;
      return jsonResponse(200, { agent: "a", kind: "agent", scopes: [] });
    };
    let now = 1_000;
    const validate = createValidator(BACKEND, { fetchImpl, ttlMs: 500, now: () => now });
    await validate("k1");
    now += 499;
    await validate("k1");
    expect(count).toBe(1);
    now += 2; // > TTL total
    await validate("k1");
    expect(count).toBe(2);
  });

  test("un 401 también se cachea dentro del TTL", async () => {
    let count = 0;
    const fetchImpl = async (): Promise<Response> => {
      count++;
      return jsonResponse(401, { error: "unauthorized" });
    };
    const validate = createValidator(BACKEND, { fetchImpl, ttlMs: 60_000 });
    expect(await validate("bad")).toBeNull();
    expect(await validate("bad")).toBeNull();
    expect(count).toBe(1);
  });
});
