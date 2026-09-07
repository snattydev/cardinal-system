import { afterEach, describe, expect, test } from "bun:test";
import { fetchProviderModels, modelsUrl, ModelFetchError } from "./discover";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("modelsUrl", () => {
  test("openai appends /v1/models", () => {
    expect(modelsUrl("https://api.openrouter.ai/api", "openai")).toBe(
      "https://api.openrouter.ai/api/v1/models",
    );
  });

  test("openai keeps /v1/models when base ends with /v1", () => {
    expect(modelsUrl("http://localhost:18999/v1", "openai")).toBe("http://localhost:18999/v1/models");
  });

  test("gemini uses v1beta/models by default", () => {
    expect(modelsUrl("https://generativelanguage.googleapis.com", "gemini")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
  });
});

describe("fetchProviderModels", () => {
  test("parses OpenAI list format with Bearer auth", async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe("https://example.com/v1/models");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-test" });
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "gpt-4o", object: "model" }, { id: "gpt-4o-mini", object: "model" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const ids = await fetchProviderModels("https://example.com/v1", "sk-test", "openai");
    expect(ids).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  test("parses Gemini models and strips models/ prefix", async () => {
    globalThis.fetch = (async (input) => {
      expect(String(input)).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models?key=gem-key",
      );
      return new Response(
        JSON.stringify({
          models: [{ name: "models/gemini-2.0-flash" }, { name: "models/gemini-pro" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const ids = await fetchProviderModels(
      "https://generativelanguage.googleapis.com",
      "gem-key",
      "gemini",
    );
    expect(ids).toEqual(["gemini-2.0-flash", "gemini-pro"]);
  });

  test("throws ModelFetchError on upstream failure", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    await expect(fetchProviderModels("https://example.com/v1", "bad", "openai")).rejects.toThrow(
      ModelFetchError,
    );
  });
});
