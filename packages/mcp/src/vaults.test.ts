import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeListVaultFiles, makeReadVaultFile } from "./vaults";

const ROOT = join(import.meta.dir, ".tmp-vaults-test");

beforeAll(() => {
  mkdirSync(join(ROOT, "the portal", "sub"), { recursive: true });
  writeFileSync(join(ROOT, "the portal", "index.md"), "# portal\n");
  writeFileSync(join(ROOT, "the portal", "sub", "note.md"), "nota\n");
  writeFileSync(join(ROOT, "the portal", "skip.txt"), "no md");
  mkdirSync(join(ROOT, "for-my-agents"), { recursive: true });
  writeFileSync(join(ROOT, "for-my-agents", "tasks.md"), "# tasks\n");
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const listVaultFiles = makeListVaultFiles(ROOT);
const readVaultFile = makeReadVaultFile(ROOT);

describe("listVaultFiles", () => {
  test("lista recursiva solo .md con tamaño relativo a la vault", async () => {
    const files = await listVaultFiles("the portal");
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(["index.md", "sub/note.md"]);
    for (const f of files) {
      expect(f.size).toBeGreaterThan(0);
      expect(f.path.endsWith(".md")).toBe(true);
    }
  });

  test("does not list files reached only through a symlink outside the vault", async () => {
    const outside = join(ROOT, "outside-secret");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "secret.md"), "secret\n");
    symlinkSync(outside, join(ROOT, "the portal", "escape"));
    symlinkSync(join(outside, "secret.md"), join(ROOT, "the portal", "linked.md"));

    const paths = (await listVaultFiles("the portal")).map((file) => file.path);
    expect(paths).toEqual(["index.md", "sub/note.md"]);
    expect(paths.some((path) => path.includes("secret") || path.includes("escape") || path === "linked.md")).toBe(
      false,
    );
  });

  test("vault inexistente → error", async () => {
    await expect(listVaultFiles("nope")).rejects.toThrow(/unknown vault/i);
  });
});

describe("readVaultFile", () => {
  test("lee un .md dentro de la vault", async () => {
    expect(await readVaultFile("the portal", "index.md")).toBe("# portal\n");
    expect(await readVaultFile("the portal", "sub/note.md")).toBe("nota\n");
  });

  test("path traversal → error, nunca lee fuera de la vault", async () => {
    await expect(readVaultFile("the portal", "../for-my-agents/tasks.md")).rejects.toThrow(
      /invalid path|traversal/i,
    );
    await expect(readVaultFile("the portal", "..%2f..%2fetc%2fpasswd.md")).rejects.toThrow();
    await expect(readVaultFile("the portal", "/etc/passwd")).rejects.toThrow(/invalid path|traversal/i);
    // traversal que igualmente resuelve dentro (ej. sub/../index.md) es válido:
    expect(await readVaultFile("the portal", "sub/../index.md")).toBe("# portal\n");
  });

  test("archivo inexistente → error", async () => {
    await expect(readVaultFile("the portal", "missing.md")).rejects.toThrow(/not found/i);
  });
});
