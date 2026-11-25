import { Database } from "bun:sqlite";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, extname, join, sep } from "node:path";
import { canReadPath, normalizePrefix, normalizeRelativePath, type AclConfig } from "./acl";

export const DEFAULT_REFRESH_INTERVAL_MS = 10_000;
export const MAX_SNIPPET_CHARS = 600;
const MAX_INDEX_BYTES = 512 * 1024;
const QMD_TIMEOUT_MS = 5_000;
const FTS_STOPWORDS = new Set(["AND", "OR", "NOT", "NEAR"]);

export type SearchFetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface SearchEngineOptions {
  vaultsRoot: string;
  writableRoot?: string;
  indexDbPath?: string;
  qmdUrl?: string;
  aclConfig?: AclConfig;
  fetchImpl?: SearchFetchLike;
  refreshIntervalMs?: number;
  now?: () => number;
}

export interface SearchHit {
  path: string;
  score: number;
  snippet: string;
}

export interface SearchOutput {
  engine: "qmd" | "fts5";
  fallbackFrom?: "qmd";
  results: SearchHit[];
}

interface DiskDoc {
  path: string;
  fullPath: string;
  mtimeMs: number;
  size: number;
}

function isWithinRoot(realRoot: string, realCandidate: string): boolean {
  const prefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  return realCandidate.startsWith(prefix);
}

function extractTitle(content: string, relPath: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim().slice(0, 200);
  }
  return basename(relPath, ".md");
}

function truncateSnippet(raw: string): string {
  const clean = raw.trim();
  if (clean.length <= MAX_SNIPPET_CHARS) return clean;
  return `${clean.slice(0, MAX_SNIPPET_CHARS - 3)}...`;
}

/**
 * Converts arbitrary user text into a safe SQLite FTS5 query of double-quoted terms.
 */
export function buildSafeFtsQuery(raw: string): string | null {
  const tokens = raw
    .split(/[\s:()[\]{}"'*^~!@#$%&+=|\\/<>,;?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  const nonStop = tokens.filter((t) => !FTS_STOPWORDS.has(t));
  const selected = nonStop.length > 0 ? nonStop : tokens;

  return selected
    .slice(0, 16)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
}

async function scanMarkdownDocs(
  root: string,
  logicalPrefix: string,
  out: Map<string, DiskDoc>,
): Promise<void> {
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    return;
  }
  const rootStat = await lstat(realRoot).catch(() => null);
  if (rootStat === null || !rootStat.isDirectory()) return;

  async function walk(currentRealDir: string, relDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentRealDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(currentRealDir, entry.name);
      const nextRel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;

      let resolved: string;
      try {
        resolved = await realpath(full);
      } catch {
        continue;
      }
      if (!isWithinRoot(realRoot, resolved)) continue;

      const info = await lstat(resolved).catch(() => null);
      if (info === null) continue;

      if (info.isDirectory()) {
        await walk(resolved, nextRel);
      } else if (info.isFile() && extname(entry.name).toLowerCase() === ".md") {
        const logicalPath = logicalPrefix ? `${logicalPrefix}/${nextRel}` : nextRel;
        out.set(logicalPath, {
          path: logicalPath,
          fullPath: resolved,
          mtimeMs: Math.floor(info.mtimeMs),
          size: info.size,
        });
      }
    }
  }

  await walk(realRoot, "");
}

function normalizeQmdPath(rawPath: string, vaultsRoot: string): string | null {
  let candidate = rawPath.trim();
  if (candidate === "") return null;

  if (candidate.startsWith("qmd://")) {
    candidate = candidate.slice("qmd://".length);
  }

  const rootClean = vaultsRoot.replace(/\/+$/, "");
  if (rootClean !== "" && candidate.startsWith(`${rootClean}/`)) {
    candidate = candidate.slice(rootClean.length + 1);
  } else if (candidate.startsWith("/data/vaults/")) {
    candidate = candidate.slice("/data/vaults/".length);
  } else if (candidate.startsWith("/data/agent-state/")) {
    candidate = `agents/${candidate.slice("/data/agent-state/".length)}`;
  }

  candidate = candidate.replace(/^\/+/, "");
  try {
    return normalizeRelativePath(candidate);
  } catch {
    return null;
  }
}

export function makeSearchEngine(options: SearchEngineOptions) {
  const {
    vaultsRoot,
    writableRoot,
    indexDbPath,
    aclConfig,
    refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
    now = () => Date.now(),
  } = options;
  const qmdUrl = options.qmdUrl?.trim().replace(/\/+$/, "") || "";
  const fetchImpl = options.fetchImpl ?? fetch;

  const db = new Database(indexDbPath ?? ":memory:");
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS docs_meta (
      path TEXT PRIMARY KEY,
      mtime_ms INTEGER NOT NULL,
      size INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      path UNINDEXED,
      title,
      content,
      tokenize='porter unicode61'
    );
  `);

  let lastSyncAt = 0;
  let syncPromise: Promise<void> | null = null;

  async function performSync(): Promise<void> {
    const diskDocs = new Map<string, DiskDoc>();
    await scanMarkdownDocs(vaultsRoot, "", diskDocs);
    if (writableRoot) {
      await scanMarkdownDocs(writableRoot, "agents", diskDocs);
    }

    const existingRows = db
      .query("SELECT path, mtime_ms, size FROM docs_meta")
      .all() as Array<{ path: string; mtime_ms: number; size: number }>;
    const existingMap = new Map(existingRows.map((r) => [r.path, r]));

    const toDelete: string[] = [];
    for (const prevPath of existingMap.keys()) {
      if (!diskDocs.has(prevPath)) {
        toDelete.push(prevPath);
      }
    }

    const toUpsert: Array<{ doc: DiskDoc; title: string; content: string }> = [];
    for (const doc of diskDocs.values()) {
      const prev = existingMap.get(doc.path);
      if (prev && prev.mtime_ms === doc.mtimeMs && prev.size === doc.size) {
        continue;
      }
      try {
        const buf = await readFile(doc.fullPath);
        const content =
          buf.byteLength > MAX_INDEX_BYTES
            ? buf.subarray(0, MAX_INDEX_BYTES).toString("utf8")
            : buf.toString("utf8");
        toUpsert.push({
          doc,
          title: extractTitle(content, doc.path),
          content,
        });
      } catch {
        // Ignore transient read errors during indexing.
      }
    }

    if (toDelete.length > 0 || toUpsert.length > 0) {
      const apply = db.transaction(() => {
        for (const path of toDelete) {
          db.run("DELETE FROM docs_fts WHERE path = ?", [path]);
          db.run("DELETE FROM docs_meta WHERE path = ?", [path]);
        }
        for (const item of toUpsert) {
          db.run("DELETE FROM docs_fts WHERE path = ?", [item.doc.path]);
          db.run("INSERT INTO docs_fts (path, title, content) VALUES (?, ?, ?)", [
            item.doc.path,
            item.title,
            item.content,
          ]);
          db.run(
            "INSERT OR REPLACE INTO docs_meta (path, mtime_ms, size) VALUES (?, ?, ?)",
            [item.doc.path, item.doc.mtimeMs, item.doc.size],
          );
        }
      });
      apply();
    }

    lastSyncAt = now();
  }

  async function syncIndex(force = false): Promise<void> {
    if (!force && lastSyncAt > 0 && now() - lastSyncAt < refreshIntervalMs) {
      return;
    }
    if (syncPromise !== null) return syncPromise;
    syncPromise = performSync().finally(() => {
      syncPromise = null;
    });
    return syncPromise;
  }

  async function searchFts(
    scopes: readonly string[],
    query: string,
    normPrefix: string,
    topK: number,
  ): Promise<SearchHit[]> {
    await syncIndex();
    const ftsQuery = buildSafeFtsQuery(query);
    if (ftsQuery === null) return [];

    const candidateLimit = Math.max(topK * 5, 25);
    const rows = db
      .query(
        `SELECT
           path,
           -bm25(docs_fts, 0.0, 2.0, 1.0) AS score,
           snippet(docs_fts, 2, '', '', '...', 48) AS snippet
         FROM docs_fts
         WHERE docs_fts MATCH ?
         ORDER BY bm25(docs_fts, 0.0, 2.0, 1.0) ASC
         LIMIT ?`,
      )
      .all(ftsQuery, candidateLimit) as Array<{
      path: string;
      score: number;
      snippet: string;
    }>;

    const results: SearchHit[] = [];
    for (const row of rows) {
      if (!canReadPath(scopes, row.path, aclConfig)) continue;
      if (normPrefix !== "" && row.path !== normPrefix && !row.path.startsWith(`${normPrefix}/`)) {
        continue;
      }
      results.push({
        path: row.path,
        score: Number(row.score),
        snippet: truncateSnippet(row.snippet ?? ""),
      });
      if (results.length >= topK) break;
    }

    return results;
  }

  async function searchQmd(
    scopes: readonly string[],
    query: string,
    normPrefix: string,
    topK: number,
  ): Promise<SearchHit[]> {
    const res = await fetchImpl(`${qmdUrl}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, limit: Math.max(topK * 4, 20) }),
      signal: AbortSignal.timeout(QMD_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`qmd returned ${res.status}`);
    }

    const payload = (await res.json()) as unknown;
    const rawList = Array.isArray(payload)
      ? payload
      : payload !== null && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
        ? (payload as { results: unknown[] }).results
        : null;

    if (rawList === null) {
      throw new Error("qmd returned unexpected payload");
    }

    const hits: SearchHit[] = [];
    for (const item of rawList) {
      if (item === null || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const rawPath =
        typeof r.file_path === "string"
          ? r.file_path
          : typeof r.file === "string"
            ? r.file
            : typeof r.path === "string"
              ? r.path
              : typeof r.uri === "string"
                ? r.uri
                : "";
      const relPath = normalizeQmdPath(rawPath, vaultsRoot);
      if (relPath === null) continue;
      if (!canReadPath(scopes, relPath, aclConfig)) continue;
      if (normPrefix !== "" && relPath !== normPrefix && !relPath.startsWith(`${normPrefix}/`)) {
        continue;
      }

      const rawSnippet =
        typeof r.snippet === "string"
          ? r.snippet
          : typeof r.content === "string"
            ? r.content
            : typeof r.body === "string"
              ? r.body
              : "";
      const score =
        typeof r.score === "number"
          ? r.score
          : typeof r.rrf_score === "number"
            ? r.rrf_score
            : 0;

      hits.push({
        path: relPath,
        score,
        snippet: truncateSnippet(rawSnippet),
      });
      if (hits.length >= topK) break;
    }

    return hits;
  }

  async function search(
    scopes: readonly string[],
    opts: { query: string; prefix?: string; topK?: number },
  ): Promise<SearchOutput> {
    const query = opts.query.trim();
    if (query === "") {
      throw new Error("missing query");
    }
    const normPrefix = normalizePrefix(opts.prefix);
    const rawTopK = opts.topK ?? 5;
    const topK = Number.isFinite(rawTopK) ? Math.max(1, Math.min(20, Math.floor(rawTopK))) : 5;

    if (qmdUrl !== "") {
      try {
        const results = await searchQmd(scopes, query, normPrefix, topK);
        return { engine: "qmd", results };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[cardinal-mcp] qmd fallback to fts5: ${msg}`);
        const results = await searchFts(scopes, query, normPrefix, topK);
        return { engine: "fts5", fallbackFrom: "qmd", results };
      }
    }

    const results = await searchFts(scopes, query, normPrefix, topK);
    return { engine: "fts5", results };
  }

  function stats(): { engine: "qmd" | "fts5"; indexedFiles: number } {
    const row = db.query("SELECT COUNT(*) AS count FROM docs_meta").get() as { count: number };
    return {
      engine: qmdUrl !== "" ? "qmd" : "fts5",
      indexedFiles: Number(row.count),
    };
  }

  function close(): void {
    db.close();
  }

  return {
    syncIndex,
    search,
    stats,
    close,
  };
}

export type SearchEngine = ReturnType<typeof makeSearchEngine>;
