import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export interface VaultFile {
  /** Path relativo a la raíz de la vault, con "/" como separador. */
  path: string;
  size: number;
}

export class VaultError extends Error {}

function vaultRoot(vaultsRoot: string, vault: string): string {
  if (vault.includes("/") || vault.includes("\\") || vault.includes("..")) {
    throw new VaultError(`invalid vault name: ${vault}`);
  }
  return resolve(vaultsRoot, vault);
}

/** Lista recursiva de archivos .md bajo la vault, con tamaño en bytes. */
export function makeListVaultFiles(vaultsRoot: string) {
  return async function listVaultFiles(vault: string): Promise<VaultFile[]> {
    const root = vaultRoot(vaultsRoot, vault);
    const out: VaultFile[] = [];

    async function walk(dir: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        throw new VaultError(`unknown vault: ${vault}`);
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const info = await stat(full);
          out.push({
            path: relative(root, full).split("\\").join("/"),
            size: info.size,
          });
        }
      }
    }

    await walk(root);
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  };
}

/**
 * Lee un archivo de la vault. Valida path traversal: resuelve el path y
 * verifica que quede dentro de VAULTS_ROOT/<vault>.
 */
export function makeReadVaultFile(vaultsRoot: string) {
  return async function readVaultFile(vault: string, rawPath: string): Promise<string> {
    const root = vaultRoot(vaultsRoot, vault);
    // Los paths llegan por JSON-RPC; decodificar por si vienen URL-encoded.
    let rel = rawPath;
    try {
      rel = decodeURIComponent(rawPath);
    } catch {
      throw new VaultError("invalid path");
    }
    if (rel.includes("\0")) throw new VaultError("invalid path");

    const full = resolve(root, rel);
    const check = relative(root, full);
    if (isAbsolute(check) || check.startsWith("..") || check === "") {
      throw new VaultError(`invalid path (traversal blocked): ${rawPath}`);
    }

    try {
      return await readFile(full, "utf8");
    } catch {
      throw new VaultError(`not found: ${rawPath}`);
    }
  };
}
