import { describe, expect, test } from "bun:test";
import { probeRouterModels, RouterProbeError, type FetchLike } from "./router-probe";

describe("probeRouterModels error hygiene", () => {
  test("a non-OK response does not copy the body or the key into the error", async () => {
    const apiKey = "ephemeral-secret-key";
    const fetchImpl: FetchLike = async () => new Response(`leaked ${apiKey}`, { status: 500 });

    try {
      await probeRouterModels({ baseUrl: "http://backend:8787/", apiKey, fetchImpl });
      throw new Error("expected RouterProbeError");
    } catch (err) {
      expect(err).toBeInstanceOf(RouterProbeError);
      const message = (err as Error).message;
      expect(message).toContain("status 500");
      expect(message).not.toContain(apiKey);
      expect(message).not.toContain("leaked");
    }
  });

  test("a whitespace base URL is rejected before fetch", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("fetch should not run");
    };
    await expect(
      probeRouterModels({ baseUrl: "   ", apiKey: "ephemeral-secret-key", fetchImpl }),
    ).rejects.toBeInstanceOf(RouterProbeError);
  });
});
