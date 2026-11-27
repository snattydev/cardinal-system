import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import {
  AclPathError,
  canReadPath,
  normalizePrefix,
  normalizeRelativePath,
  type AclConfig,
} from "./acl";

export const DEFAULT_MAX_READ_BYTES = 32_768;
export const HARD_MAX_READ_BYTES = 131_072;
export const MAX_LIST_ENTRIES = 200;
export const ALLOWED_EXTENSIONS = new Set([".md"]);

export interface VaultDirectoryEntry {
  path: string;
  fileCount: number;
}

export interface VaultFileEntry {
  path: string;
  size: number;
}

export interface VaultListResult {
  prefix: string;
  directories: VaultDirectoryEntry[];
  files: VaultFileEntry[];
  totalFiles: number;
  truncated: boolean;
}

export interface VaultReadResult {
  path: string;
  content: string;
  bytes: number;
  totalBytes: number;
  truncated: boolean;
}

export interface VaultStoreOptions {
  vaultsRoot: string;
  writableRoot?: string;
  aclConfig?: AclConfig;
}

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

function isWithinRoot(realRoot: string, realCandidate: string): boolean {
  const prefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  return realCandidate.startsWith(prefix);
}

/**
 * Resolves a relative path inside root and blocks symlink escapes.
 * Never leaks absolute host/container paths in errors.
 */
export async function resolveSafeFile(root: string, relPath: string): Promise<string> {
  let cleanRel: string;
  try {
    cleanRel = normalizeRelativePath(relPath);
  } catch (err) {
    throw new VaultError(err instanceof Error ? err.message : "invalid path");
  }

  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    throw new VaultError("vault root unavailable");
  }

  const candidate = resolve(realRoot, cleanRel);
  let realCandidate: string;
  try {
    realCandidate = await realpath(candidate);
  } catch {
    throw new VaultError(`not found: ${cleanRel}`);
  }

  if (!isWithinRoot(realRoot, realCandidate)) {
    throw new VaultError("forbidden: path outside root");
  }

  const info = await lstat(realCandidate).catch(() => null);
  if (info === null || !info.isFile()) {
    throw new VaultError(`not found: ${cleanRel}`);
  }

  return realCandidate;
}

function decodeUtf8Bounded(buf: Buffer, maxBytes: number): string {
  if (buf.byteLength <= maxBytes) return buf.toString("utf8");
  let end = maxBytes;
  // Walk back past UTF-8 continuation bytes (10xxxxxx) so we do not split a character.
  while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
    end -= 1;
  }
  if (end === 0) end = maxBytes;
  return buf.subarray(0, end).toString("utf8");
}

async function collectMarkdownFiles(
  root: string,
  logicalPrefix: string,
  out: Map<string, number>,
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
      if (!isWithinRoot(realRoot, resolved)) {
        continue;
      }

      const info = await lstat(resolved).catch(() => null);
      if (info === null) continue;

      if (info.isDirectory()) {
        await walk(resolved, nextRel);
      } else if (info.isFile() && ALLOWED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const logicalPath = logicalPrefix ? `${logicalPrefix}/${nextRel}` : nextRel;
        out.set(logicalPath, info.size);
      }
    }
  }

  await walk(realRoot, "");
}

export function makeVaultStore(options: VaultStoreOptions) {
  const { vaultsRoot, writableRoot, aclConfig } = options;

  async function resolveTargetForRead(cleanRel: string): Promise<string> {
    if (writableRoot && (cleanRel === "agents" || cleanRel.startsWith("agents/"))) {
      const subPath = cleanRel === "agents" ? "" : cleanRel.slice("agents/".length);
      if (subPath.length > 0) {
        try {
          return await resolveSafeFile(writableRoot, subPath);
        } catch (err) {
          if (err instanceof VaultError && err.message.startsWith("not found:")) {
            // Fall back to vaultsRoot/agents/... when absent in writable overlay.
          } else {
            throw err;
          }
        }
      }
    }
    return resolveSafeFile(vaultsRoot, cleanRel);
  }

  async function listEntries(
    scopes: readonly string[],
    opts: { prefix?: string; depth?: number } = {},
  ): Promise<VaultListResult> {
    let normPrefix: string;
    try {
      normPrefix = normalizePrefix(opts.prefix);
    } catch (err) {
      throw new VaultError(err instanceof Error ? err.message : "invalid prefix");
    }

    const rawDepth = opts.depth ?? 2;
    const maxDepth = Number.isFinite(rawDepth)
      ? Math.max(1, Math.min(5, Math.floor(rawDepth)))
      : 2;

    const allFiles = new Map<string, number>();
    await collectMarkdownFiles(vaultsRoot, "", allFiles);
    if (writableRoot) {
      await collectMarkdownFiles(writableRoot, "agents", allFiles);
    }

    const dirCounts = new Map<string, number>();
    const directFiles: VaultFileEntry[] = [];
    let totalFiles = 0;

    for (const [path, size] of allFiles.entries()) {
      if (!canReadPath(scopes, path, aclConfig)) continue;
      if (normPrefix !== "" && path !== normPrefix && !path.startsWith(`${normPrefix}/`)) {
        continue;
      }
      totalFiles += 1;

      const relFromPrefix =
        normPrefix === ""
          ? path
          : path === normPrefix
            ? path.split("/").pop()!
            : path.slice(normPrefix.length + 1);
      const segs = relFromPrefix.split("/");

      if (segs.length <= maxDepth) {
        directFiles.push({ path, size });
      }

      const dirSegLimit = Math.min(segs.length - 1, maxDepth);
      for (let i = 1; i <= dirSegLimit; i += 1) {
        const subDir = segs.slice(0, i).join("/");
        const fullDir = normPrefix === "" ? subDir : `${normPrefix}/${subDir}`;
        dirCounts.set(fullDir, (dirCounts.get(fullDir) ?? 0) + 1);
      }
    }

    const sortedDirs: VaultDirectoryEntry[] = [...dirCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([path, fileCount]) => ({ path, fileCount }));
    directFiles.sort((a, b) => a.path.localeCompare(b.path));

    let truncated = false;
    const directories: VaultDirectoryEntry[] = [];
    const files: VaultFileEntry[] = [];

    for (const dir of sortedDirs) {
      if (directories.length + files.length >= MAX_LIST_ENTRIES) {
        truncated = true;
        break;
      }
      directories.push(dir);
    }

    for (const file of directFiles) {
      if (directories.length + files.length >= MAX_LIST_ENTRIES) {
        truncated = true;
        break;
      }
      files.push(file);
    }

    return {
      prefix: normPrefix,
      directories,
      files,
      totalFiles,
      truncated,
    };
  }

  async function readMarkdown(
    scopes: readonly string[],
    relPath: string,
    maxBytes?: number,
  ): Promise<VaultReadResult> {
    let cleanRel: string;
    try {
      cleanRel = normalizeRelativePath(relPath);
    } catch (err) {
      throw new VaultError(err instanceof Error ? err.message : "invalid path");
    }

    if (!canReadPath(scopes, cleanRel, aclConfig)) {
      throw new VaultError("forbidden: path outside allowed scopes");
    }

    if (!ALLOWED_EXTENSIONS.has(extname(cleanRel).toLowerCase())) {
      throw new VaultError("forbidden: only markdown (.md) files are readable");
    }

    const physicalPath = await resolveTargetForRead(cleanRel);
    const buf = await readFile(physicalPath);
    const totalBytes = buf.byteLength;
    const requested =
      typeof maxBytes === "number" && Number.isFinite(maxBytes) && maxBytes > 0
        ? Math.floor(maxBytes)
        : DEFAULT_MAX_READ_BYTES;
    const limit = Math.min(requested, HARD_MAX_READ_BYTES);
    const truncated = totalBytes > limit;
    const content = decodeUtf8Bounded(buf, limit);

    return {
      path: cleanRel,
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      totalBytes,
      truncated,
    };
  }

  return {
    listEntries,
    readMarkdown,
  };
}

export type VaultStore = ReturnType<typeof makeVaultStore>;
