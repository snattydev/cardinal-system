import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import {
  canReadConfig,
  normalizePrefix,
  normalizeRelativePath,
  type ConfigCategory,
} from "./acl";
import { isSensitiveConfigFilename, redactSecrets } from "./redact";
import {
  DEFAULT_MAX_READ_BYTES,
  HARD_MAX_READ_BYTES,
  MAX_LIST_ENTRIES,
  resolveSafeFile,
  VaultError,
} from "./vaults";

export const ALLOWED_CONFIG_EXTENSIONS = new Set([
  ".json",
  ".jsonc",
  ".toml",
  ".yaml",
  ".yml",
  ".ini",
  ".conf",
  ".md",
  ".txt",
  ".sh",
  ".fish",
  ".zsh",
  ".bash",
  ".kdl",
  ".tmux",
  "",
]);

export const MAX_CONFIG_FILE_BYTES = 1_048_576;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface ConfigStoreOptions {
  configsRoot?: string;
}

export interface ConfigDirectoryEntry {
  path: string;
  fileCount: number;
}

export interface ConfigFileEntry {
  path: string;
  size: number;
}

export interface ConfigListResult {
  category: ConfigCategory;
  prefix: string;
  available: boolean;
  directories: ConfigDirectoryEntry[];
  files: ConfigFileEntry[];
  totalFiles: number;
  truncated: boolean;
}

export interface ConfigReadResult {
  category: ConfigCategory;
  path: string;
  content: string;
  bytes: number;
  totalBytes: number;
  truncated: boolean;
  redactedCount: number;
}

function isWithinRoot(realRoot: string, realCandidate: string): boolean {
  const prefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  return realCandidate.startsWith(prefix);
}

function decodeUtf8Bounded(buf: Buffer, maxBytes: number): string {
  if (buf.byteLength <= maxBytes) return buf.toString("utf8");
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
    end -= 1;
  }
  if (end === 0) end = maxBytes;
  return buf.subarray(0, end).toString("utf8");
}

function stripRedundantCategory(category: ConfigCategory, raw: string): string {
  const trimmed = raw.trim();
  const prefix = `${category}/`;
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }
  return trimmed;
}

async function collectConfigFiles(
  categoryRoot: string,
  out: Map<string, number>,
): Promise<boolean> {
  let realRoot: string;
  try {
    realRoot = await realpath(categoryRoot);
  } catch {
    return false;
  }
  const rootStat = await lstat(realRoot).catch(() => null);
  if (rootStat === null || !rootStat.isDirectory()) return false;

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
      if (isSensitiveConfigFilename(nextRel)) continue;

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
      } else if (
        info.isFile() &&
        ALLOWED_CONFIG_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) {
        out.set(nextRel, info.size);
      }
    }
  }

  await walk(realRoot, "");
  return true;
}

/**
 * Read-only, ACL-enforced, secret-redacted store over `/data/configs/{agents,user}`.
 */
export function makeConfigStore(options: ConfigStoreOptions) {
  const { configsRoot } = options;

  function categoryRoot(category: ConfigCategory): string {
    if (!configsRoot) {
      throw new ConfigError("config root not configured");
    }
    return join(configsRoot, category);
  }

  async function listConfigs(
    scopes: readonly string[],
    category: ConfigCategory,
    opts: { prefix?: string; depth?: number } = {},
  ): Promise<ConfigListResult> {
    let normPrefix: string;
    try {
      const stripped = opts.prefix ? stripRedundantCategory(category, opts.prefix) : undefined;
      normPrefix = normalizePrefix(stripped);
    } catch (err) {
      throw new ConfigError(err instanceof Error ? err.message : "invalid prefix");
    }

    if (!configsRoot) {
      return {
        category,
        prefix: normPrefix,
        available: false,
        directories: [],
        files: [],
        totalFiles: 0,
        truncated: false,
      };
    }

    const rawDepth = opts.depth ?? 2;
    const maxDepth = Number.isFinite(rawDepth)
      ? Math.max(1, Math.min(5, Math.floor(rawDepth)))
      : 2;

    const allFiles = new Map<string, number>();
    const available = await collectConfigFiles(categoryRoot(category), allFiles);

    const dirCounts = new Map<string, number>();
    const directFiles: ConfigFileEntry[] = [];
    let totalFiles = 0;

    for (const [relPath, size] of allFiles.entries()) {
      if (!canReadConfig(scopes, category, relPath)) continue;
      if (normPrefix !== "" && relPath !== normPrefix && !relPath.startsWith(`${normPrefix}/`)) {
        continue;
      }
      totalFiles += 1;

      const relFromPrefix =
        normPrefix === ""
          ? relPath
          : relPath === normPrefix
            ? relPath.split("/").pop()!
            : relPath.slice(normPrefix.length + 1);
      const parts = relFromPrefix.split("/");
      if (parts.length <= maxDepth) {
        directFiles.push({ path: relPath, size });
      } else {
        const dirRel = parts.slice(0, maxDepth).join("/");
        const fullDir = normPrefix === "" ? dirRel : `${normPrefix}/${dirRel}`;
        dirCounts.set(fullDir, (dirCounts.get(fullDir) ?? 0) + 1);
      }
    }

    const directories: ConfigDirectoryEntry[] = Array.from(dirCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, fileCount]) => ({ path, fileCount }));
    directFiles.sort((a, b) => a.path.localeCompare(b.path));

    const remaining = Math.max(0, MAX_LIST_ENTRIES - directories.length);
    const truncated = directFiles.length > remaining || directories.length > MAX_LIST_ENTRIES;

    return {
      category,
      prefix: normPrefix,
      available,
      directories: directories.slice(0, MAX_LIST_ENTRIES),
      files: directFiles.slice(0, remaining),
      totalFiles,
      truncated,
    };
  }

  async function readConfig(
    scopes: readonly string[],
    category: ConfigCategory,
    relPath: string,
    maxBytes = DEFAULT_MAX_READ_BYTES,
  ): Promise<ConfigReadResult> {
    if (!configsRoot) {
      throw new ConfigError("config root not configured");
    }

    let cleanRel: string;
    try {
      cleanRel = normalizeRelativePath(stripRedundantCategory(category, relPath));
    } catch (err) {
      throw new ConfigError(err instanceof Error ? err.message : "invalid path");
    }

    const otherCategory: ConfigCategory = category === "agents" ? "user" : "agents";
    if (cleanRel === otherCategory || cleanRel.startsWith(`${otherCategory}/`)) {
      throw new ConfigError(`forbidden: cannot read ${otherCategory} config from ${category} tool`);
    }

    if (!canReadConfig(scopes, category, cleanRel)) {
      throw new ConfigError(`forbidden: ${category}/${cleanRel}`);
    }

    if (isSensitiveConfigFilename(cleanRel)) {
      throw new ConfigError(`forbidden: sensitive filename blocked (${cleanRel})`);
    }

    const ext = extname(cleanRel).toLowerCase();
    if (!ALLOWED_CONFIG_EXTENSIONS.has(ext)) {
      throw new ConfigError(`forbidden: unsupported config extension "${ext}"`);
    }

    let resolvedFile: string;
    try {
      resolvedFile = await resolveSafeFile(categoryRoot(category), cleanRel);
    } catch (err) {
      throw new ConfigError(
        err instanceof VaultError ? err.message : "config file unavailable",
      );
    }

    const raw = await readFile(resolvedFile);
    if (raw.includes(0)) {
      throw new ConfigError(`forbidden: binary content blocked (${cleanRel})`);
    }

    if (raw.byteLength > MAX_CONFIG_FILE_BYTES) {
      throw new ConfigError(
        `config file exceeds max readable size (${MAX_CONFIG_FILE_BYTES} bytes)`,
      );
    }

    const boundedLimit = Math.max(
      1,
      Math.min(HARD_MAX_READ_BYTES, Math.floor(Number.isFinite(maxBytes) ? maxBytes : DEFAULT_MAX_READ_BYTES)),
    );
    const redacted = redactSecrets(raw.toString("utf8"));
    const redactedBuf = Buffer.from(redacted.text, "utf8");
    const truncated = redactedBuf.byteLength > boundedLimit;
    const content = decodeUtf8Bounded(redactedBuf, boundedLimit);

    return {
      category,
      path: cleanRel,
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      totalBytes: raw.byteLength,
      truncated,
      redactedCount: redacted.redactedCount,
    };
  }

  return {
    listConfigs,
    readConfig,
  };
}

export type ConfigStore = ReturnType<typeof makeConfigStore>;
