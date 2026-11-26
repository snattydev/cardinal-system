import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAL_OPT_IN_SCOPE } from "./acl";
import { buildSafeFtsQuery, makeSearchEngine, normalizeQmdPath } from "./search";

const ROOT = join(import.meta.dir, ".tmp-search-test");
const VAULTS = join(ROOT, "vaults");
const WRITABLE = join(ROOT, "agent-state");

beforeAll(() => {
  mkdirSync(join(VAULTS, "skills", "coding"), { recursive: true });
  mkdirSync(join(VAULTS, "projects"), { recursive: true });
  mkdirSync(join(VAULTS, "personal"), { recursive: true });
  mkdirSync(join(WRITABLE, "handoffs"), { recursive: true });

  writeFileSync(
    join(VAULTS, "skills", "coding", "git.md"),
    "# Git Workflow\n\nAlways rebase cleanly and never force push main.\n",
  );
  writeFileSync(
    join(VAULTS, "projects", "cardinal.md"),
    "# Cardinal Hub\n\nStreamable HTTP MCP server with SQLite FTS5 indexing.\n",
  );
  writeFileSync(
    join(VAULTS, "personal", "diary.md"),
    "# Personal Diary\n\nPrivate personal rebase notes and banking secret.\n",
  );
  writeFileSync(
    join(WRITABLE, "handoffs", "my-app.md"),
    "# Handoff: my-app\n\nNext step: verify Streamable HTTP transport.\n",
  );
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("buildSafeFtsQuery", () => {
  test("sanitizes hostile FTS5 operators and punctuation", () => {
    expect(buildSafeFtsQuery('foo:bar (test) AND NOT *"')).toBe('"foo" "bar" "test"');
    expect(buildSafeFtsQuery("C++")).toBe('"C"');
    expect(buildSafeFtsQuery("   :()*  ")).toBeNull();
  });
});

describe("makeSearchEngine (FTS5)", () => {
  test("indexes vaults + writable overlay, enforces ACLs, and filters personal/**", async () => {
    const engine = makeSearchEngine({ vaultsRoot: VAULTS, writableRoot: WRITABLE });
    await engine.syncIndex(true);
    expect(engine.stats()).toEqual({ engine: "fts5", indexedFiles: 4 });

    // Even wildcard "*" must never return personal/diary.md
    const wildcardHits = await engine.search(["*"], { query: "rebase", topK: 5 });
    expect(wildcardHits.engine).toBe("fts5");
    expect(wildcardHits.results.map((r) => r.path)).toEqual(["skills/coding/git.md"]);

    // With explicit personal opt-in, personal/diary.md becomes visible
    const optInHits = await engine.search(
      [PERSONAL_OPT_IN_SCOPE, "vault:read:personal/**"],
      { query: "banking secret", topK: 5 },
    );
    expect(optInHits.results.map((r) => r.path)).toEqual(["personal/diary.md"]);

    // Prefix filtering restricts results cleanly
    const prefixHits = await engine.search(["*"], {
      query: "Streamable HTTP",
      prefix: "agents/handoffs",
      topK: 5,
    });
    expect(prefixHits.results.map((r) => r.path)).toEqual(["agents/handoffs/my-app.md"]);

    // Hostile query punctuation does not throw SQLite FTS5 errors
    const hostileHits = await engine.search(["*"], {
      query: 'Streamable:HTTP (MCP) AND NOT *"',
      topK: 5,
    });
    expect(hostileHits.results.length).toBeGreaterThan(0);

    engine.close();
  });

  test("incrementally updates and deletes removed files on re-sync", async () => {
    const dynRoot = join(ROOT, "dyn-vaults");
    mkdirSync(join(dynRoot, "notes"), { recursive: true });
    const noteFile = join(dynRoot, "notes", "ephemeral.md");
    writeFileSync(noteFile, "# Ephemeral\n\nAlpha token keyword.\n");

    const engine = makeSearchEngine({ vaultsRoot: dynRoot, refreshIntervalMs: 0 });
    await engine.syncIndex(true);
    let hits = await engine.search(["*"], { query: "Alpha" });
    expect(hits.results).toHaveLength(1);

    unlinkSync(noteFile);
    await engine.syncIndex(true);
    hits = await engine.search(["*"], { query: "Alpha" });
    expect(hits.results).toHaveLength(0);
    expect(engine.stats().indexedFiles).toBe(0);

    engine.close();
  });

  test("prevents FTS5 search starvation when denied prefix has >25 matching hits", async () => {
    const starvRoot = join(ROOT, "starvation-vaults");
    const personalDir = join(starvRoot, "personal");
    const projectsDir = join(starvRoot, "projects");
    mkdirSync(personalDir, { recursive: true });
    mkdirSync(projectsDir, { recursive: true });

    for (let i = 1; i <= 35; i++) {
      writeFileSync(
        join(personalDir, `secret-${String(i).padStart(2, "0")}.md`),
        `# Personal Secret ${i}\n\nquantum quantum quantum confidential notes.\n`,
      );
    }

    writeFileSync(
      join(projectsDir, "alpha.md"),
      "# Project Alpha\n\nquantum once in project alpha.\n",
    );
    writeFileSync(
      join(projectsDir, "beta.md"),
      "# Project Beta\n\nquantum once in project beta.\n",
    );

    const engine = makeSearchEngine({ vaultsRoot: starvRoot });
    await engine.syncIndex(true);

    const hits = await engine.search(["*"], { query: "quantum", topK: 5 });
    expect(hits.engine).toBe("fts5");
    const paths = hits.results.map((r) => r.path).sort();
    expect(paths).toEqual(["projects/alpha.md", "projects/beta.md"]);

    engine.close();
  });
});

describe("makeSearchEngine (QMD sidecar + fallback)", () => {
  test("queries QMD, normalizes paths, and filters personal/** by ACL", async () => {
    const engine = makeSearchEngine({
      vaultsRoot: VAULTS,
      qmdUrl: "http://qmd:8181",
      fetchImpl: (async () =>
        Response.json({
          results: [
            {
              file: "qmd:///data/vaults/personal/diary.md",
              score: 0.99,
              snippet: "banking secret",
            },
            {
              file: "/data/vaults/skills/coding/git.md",
              score: 0.85,
              snippet: "Always rebase cleanly",
            },
          ],
        })) as unknown as typeof fetch,
    });

    const out = await engine.search(["*"], { query: "rebase" });
    expect(out.engine).toBe("qmd");
    expect(out.results).toEqual([
      {
        path: "skills/coding/git.md",
        score: 0.85,
        snippet: "Always rebase cleanly",
      },
    ]);
    engine.close();
  });

  test("falls back seamlessly to FTS5 when QMD fails", async () => {
    const engine = makeSearchEngine({
      vaultsRoot: VAULTS,
      qmdUrl: "http://qmd:8181",
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });

    const out = await engine.search(["*"], { query: "Streamable" });
    expect(out.engine).toBe("fts5");
    expect(out.fallbackFrom).toBe("qmd");
    expect(out.results.map((r) => r.path)).toEqual(["projects/cardinal.md"]);
    engine.close();
  });

  test("maps custom writableRoot path to agents/* in QMD path normalization", async () => {
    expect(
      normalizeQmdPath(`${WRITABLE}/handoffs/my-app.md`, VAULTS, WRITABLE),
    ).toBe("agents/handoffs/my-app.md");
    expect(
      normalizeQmdPath(`qmd://${WRITABLE}/handoffs/my-app.md`, VAULTS, WRITABLE),
    ).toBe("agents/handoffs/my-app.md");

    const engine = makeSearchEngine({
      vaultsRoot: VAULTS,
      writableRoot: WRITABLE,
      qmdUrl: "http://qmd:8181",
      fetchImpl: (async () =>
        Response.json({
          results: [
            {
              file: `${WRITABLE}/handoffs/my-app.md`,
              score: 0.95,
              snippet: "Next step: verify Streamable HTTP transport.",
            },
          ],
        })) as unknown as typeof fetch,
    });

    const out = await engine.search(["*"], { query: "Streamable", topK: 5 });
    expect(out.engine).toBe("qmd");
    expect(out.results).toEqual([
      {
        path: "agents/handoffs/my-app.md",
        score: 0.95,
        snippet: "Next step: verify Streamable HTTP transport.",
      },
    ]);
    engine.close();
  });
});
