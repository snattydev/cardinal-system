import { describe, expect, test } from "bun:test";
import { createDb, upsertProvider } from "@cardinal/db";
import { RouterError } from "./error";
import { resolveModelChain } from "./resolve";

function seedProvider(
  db: ReturnType<typeof createDb>,
  name: string,
  baseUrl: string,
  opts: { status?: "active" | "disabled"; apiKeyEnc?: string; wireFormat?: "openai" | "anthropic" | "gemini"; costPerMtok?: number } = {},
): void {
  upsertProvider(db, {
    name,
    baseUrl,
    status: opts.status,
    apiKeyEnc: opts.apiKeyEnc,
    wireFormat: opts.wireFormat,
    costPerMtok: opts.costPerMtok,
  });
}

describe("resolveModelChain", () => {
  test("alias chain keeps usable hops in order and drops malformed or unusable ones", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "down", "http://down/v1", {
      status: "disabled",
      apiKeyEnc: "enc-down",
      costPerMtok: 9,
    });
    seedProvider(db, "blank", "");
    seedProvider(db, "live", "http://live/v1", {
      apiKeyEnc: "enc-live",
      wireFormat: "gemini",
      costPerMtok: 1.5,
    });
    seedProvider(db, "second", "http://second/v1");
    db.run("INSERT INTO model_routes (alias, fallback_chain) VALUES (?, ?)", [
      "fast",
      JSON.stringify([
        { provider: "down", model: "m-down" },
        { provider: "blank", model: "m-blank" },
        "nope",
        null,
        { provider: "ghost", model: "m-ghost" },
        { model: "missing-provider" },
        { provider: "live" },
        { provider: "live", model: "m-live" },
        { provider: "second", model: "m-second" },
      ]),
    ]);

    const chain = await resolveModelChain(db, "fast");
    expect(chain).toEqual([
      {
        providerId: expect.any(Number),
        providerName: "live",
        baseUrl: "http://live/v1",
        apiKeyEnc: "enc-live",
        wireFormat: "gemini",
        modelId: "m-live",
        costPerMtok: 1.5,
      },
      {
        providerId: expect.any(Number),
        providerName: "second",
        baseUrl: "http://second/v1",
        apiKeyEnc: null,
        wireFormat: "openai",
        modelId: "m-second",
        costPerMtok: 0,
      },
    ]);
    db.close();
  });

  test("a named route that cannot be used throws model_not_found and does not fall through to autorouter", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "catalog", "http://catalog/v1");
    const provider = db.query("SELECT id FROM providers WHERE name = ?").get("catalog") as { id: number };
    db.run("INSERT INTO provider_models (provider_id, model_id) VALUES (?, ?)", [provider.id, "fast"]);

    for (const chain of ["not-json", JSON.stringify({ provider: "catalog", model: "fast" }), "[]"]) {
      db.run(
        "INSERT INTO model_routes (alias, fallback_chain) VALUES (?, ?) ON CONFLICT(alias) DO UPDATE SET fallback_chain = excluded.fallback_chain",
        ["fast", chain],
      );
      await expect(resolveModelChain(db, "fast")).rejects.toMatchObject({
        name: "RouterError",
        code: "model_not_found",
      });
    }

    db.run("UPDATE providers SET status = 'disabled' WHERE name = 'catalog'");
    db.run(
      "UPDATE model_routes SET fallback_chain = ? WHERE alias = 'fast'",
      [JSON.stringify([{ provider: "catalog", model: "m-catalog" }])],
    );
    await expect(resolveModelChain(db, "fast")).rejects.toBeInstanceOf(RouterError);
    db.close();
  });

  test("autorouter returns active providers with a base URL, ordered by id", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "first", "http://first/v1", { apiKeyEnc: "enc-first", costPerMtok: 2 });
    seedProvider(db, "skipped-off", "http://off/v1", { status: "disabled" });
    seedProvider(db, "skipped-blank", "");
    seedProvider(db, "second", "http://second/v1", { wireFormat: "anthropic", costPerMtok: 4 });
    for (const name of ["first", "skipped-off", "skipped-blank", "second"]) {
      const row = db.query("SELECT id FROM providers WHERE name = ?").get(name) as { id: number };
      db.run("INSERT INTO provider_models (provider_id, model_id) VALUES (?, ?)", [row.id, "shared-model"]);
    }

    const chain = await resolveModelChain(db, "shared-model");
    expect(chain).toEqual([
      expect.objectContaining({
        providerName: "first",
        baseUrl: "http://first/v1",
        apiKeyEnc: "enc-first",
        wireFormat: "openai",
        modelId: "shared-model",
        costPerMtok: 2,
      }),
      expect.objectContaining({
        providerName: "second",
        baseUrl: "http://second/v1",
        apiKeyEnc: null,
        wireFormat: "anthropic",
        modelId: "shared-model",
        costPerMtok: 4,
      }),
    ]);
    db.close();
  });

  test("unknown model with no route throws model_not_found", async () => {
    const db = createDb(":memory:");
    seedProvider(db, "live", "http://live/v1");
    await expect(resolveModelChain(db, "missing")).rejects.toMatchObject({ code: "model_not_found" });
    db.close();
  });
});
