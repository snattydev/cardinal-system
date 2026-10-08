import { describe, expect, test } from "bun:test";
import { createDb } from "@cardinal/db";
import {
  RagUpstreamError,
  getCached,
  normalizeResults,
  putCached,
  searchWithCache,
} from "./rag";

describe("normalizeResults", () => {
  test("mapea un resultado hybrid (rrf_score) → RagResult con source 'vault'", () => {
    const raw = [
      {
        id: 1,
        file_path: "notes/sao.md",
        chunk_index: 0,
        heading: "Kirito",
        content: "dual wielding",
        tokens: 10,
        sources: ["vector", "keyword"],
        rrf_score: 0.042,
      },
    ];
    expect(normalizeResults(raw)).toEqual([
      { path: "notes/sao.md", score: 0.042, content: "Kirito\n\ndual wielding", source: "vault" },
    ]);
  });

  test("usa score cuando no hay rrf_score (semantic/keyword)", () => {
    const raw = [
      {
        id: 2,
        file_path: "b.md",
        chunk_index: 1,
        heading: "",
        content: "body",
        tokens: 5,
        score: 0.9,
        source: "keyword",
      },
    ];
    expect(normalizeResults(raw)).toEqual([
      { path: "b.md", score: 0.9, content: "body", source: "vault" },
    ]);
  });

  test("heading vacío → content sin prefijo de heading", () => {
    const raw = [{ file_path: "a.md", heading: "", content: "solo body" }];
    expect(normalizeResults(raw)[0].content).toBe("solo body");
  });

  test("saltea entradas malformadas (sin path, sin content, no-objetos)", () => {
    const raw = [
      { file_path: "ok.md", content: "x" },
      { content: "no path" },
      { file_path: "no content" },
      null,
      "string",
      42,
    ];
    expect(normalizeResults(raw)).toEqual([
      { path: "ok.md", score: 0, content: "x", source: "vault" },
    ]);
  });
});

describe("rag cache (getCached/putCached)", () => {
  test("getCached en cache vacío → null", async () => {
    const db = createDb(":memory:");
    expect(await getCached(db, "kirito", 5)).toBeNull();
    db.close();
  });

  test("putCached + getCached roundtrip devuelve results y cached_at", async () => {
    const db = createDb(":memory:");
    const resultsJson = JSON.stringify([
      { path: "a.md", score: 1, content: "x", source: "vault" },
    ]);
    await putCached(db, "kirito", 5, resultsJson);
    const hit = await getCached(db, "kirito", 5);
    expect(hit).not.toBeNull();
    expect(hit!.results).toEqual([{ path: "a.md", score: 1, content: "x", source: "vault" }]);
    expect(typeof hit!.cached_at).toBe("string");
    db.close();
  });

  test("mismo query con mode distinto no colisiona en el cache", async () => {
    const db = createDb(":memory:");
    await putCached(db, "kirito", 5, JSON.stringify([{ path: "h.md", score: 1, content: "x", source: "vault" }]), "hybrid");
    expect(await getCached(db, "kirito", 5, "semantic")).toBeNull();
    expect(await getCached(db, "kirito", 5, "hybrid")).not.toBeNull();
    db.close();
  });

  test("corrupt cached JSON is a miss", async () => {
    const db = createDb(":memory:");
    await putCached(db, "kirito", 5, "[]");
    db.run("UPDATE rag_cache SET results = ?", ["{not-json"]);
    expect(await getCached(db, "kirito", 5)).toBeNull();
    db.close();
  });

  test("entrada vieja (más de 1 hora) → null", async () => {
    const db = createDb(":memory:");
    await putCached(db, "kirito", 5, JSON.stringify([{ path: "a.md", score: 1, content: "x", source: "vault" }]));
    db.run("UPDATE rag_cache SET created_at = datetime('now', '-2 hours')");
    expect(await getCached(db, "kirito", 5)).toBeNull();
    db.close();
  });

  test("putCached trima la tabla a las 1000 filas más nuevas", async () => {
    const db = createDb(":memory:");
    for (let i = 0; i < 1005; i++) {
      await putCached(db, `query-${i}`, 5, "[]");
    }
    const count = (db.query("SELECT COUNT(*) AS count FROM rag_cache").get() as { count: number }).count;
    expect(count).toBe(1000);
    db.close();
  });
});

describe("searchWithCache", () => {
  test("miss: llama al upstream una vez, normaliza y devuelve cached: false", async () => {
    const db = createDb(":memory:");
    let calls = 0;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls++;
      expect(url).toBe("http://vault:8788/search");
      expect(JSON.parse(String(init?.body))).toEqual({ query: "kirito", top_k: 5, mode: "hybrid" });
      return new Response(
        JSON.stringify({ results: [{ file_path: "a.md", content: "x", heading: "H", rrf_score: 0.5 }] }),
        { status: 200 },
      );
    };
    const result = await searchWithCache(db, {
      query: "kirito",
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    expect(calls).toBe(1);
    expect(result.cached).toBe(false);
    expect(result.cached_at).toBeUndefined();
    expect(result.results).toEqual([{ path: "a.md", score: 0.5, content: "H\n\nx", source: "vault" }]);
    db.close();
  });

  test("hit: segunda llamada devuelve cache sin volver al upstream", async () => {
    const db = createDb(":memory:");
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(
        JSON.stringify({ results: [{ file_path: "a.md", content: "x", heading: "H", rrf_score: 0.5 }] }),
        { status: 200 },
      );
    };
    const first = await searchWithCache(db, { query: "kirito", fetchImpl, baseUrl: "http://vault:8788" });
    expect(first.cached).toBe(false);
    const second = await searchWithCache(db, { query: "kirito", fetchImpl, baseUrl: "http://vault:8788" });
    expect(second.cached).toBe(true);
    expect(typeof second.cached_at).toBe("string");
    expect(second.results).toEqual(first.results);
    expect(calls).toBe(1);
    db.close();
  });

  test("envía el token en X-Vault-Token", async () => {
    const db = createDb(":memory:");
    let headers: Headers | undefined;
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      headers = new Headers(init?.headers as HeadersInit);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    await searchWithCache(db, {
      query: "x",
      token: "sk-cardinal-test",
      fetchImpl,
      baseUrl: "http://vault:8788",
    });
    expect(headers!.get("x-vault-token")).toBe("sk-cardinal-test");
    db.close();
  });

  test("upstream network error → RagUpstreamError", async () => {
    const db = createDb(":memory:");
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(searchWithCache(db, { query: "kirito", fetchImpl })).rejects.toThrow(RagUpstreamError);
    db.close();
  });

  test("corrupt cache is ignored and the upstream is called", async () => {
    const db = createDb(":memory:");
    await putCached(db, "kirito", 5, "[]");
    db.run("UPDATE rag_cache SET results = ?", ["{not-json"]);
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(JSON.stringify({ results: [{ file_path: "a.md", content: "x" }] }), {
        status: 200,
      });
    };
    const result = await searchWithCache(db, { query: "kirito", fetchImpl, baseUrl: "http://vault:8788" });
    expect(calls).toBe(1);
    expect(result.cached).toBe(false);
    expect(result.results).toEqual([{ path: "a.md", score: 0, content: "x", source: "vault" }]);
    db.close();
  });

  test("a missing or non-array results field becomes an empty list", async () => {
    const db = createDb(":memory:");
    const fetchImpl = async () => new Response(JSON.stringify({ results: { file_path: "a.md" } }), { status: 200 });
    const result = await searchWithCache(db, { query: "kirito", fetchImpl, baseUrl: "http://vault:8788" });
    expect(result).toEqual({ results: [], cached: false });
    db.close();
  });

  test("upstream HTTP error → RagUpstreamError con detail del body", async () => {
    const db = createDb(":memory:");
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: "search_failed", detail: "boom" }), { status: 500 });
    const err = await searchWithCache(db, { query: "kirito", fetchImpl }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RagUpstreamError);
    expect((err as RagUpstreamError).detail).toBe("boom");
    db.close();
  });
});
