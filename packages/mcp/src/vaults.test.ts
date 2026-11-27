import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAL_OPT_IN_SCOPE } from "./acl";
import { makeVaultStore, resolveSafeFile } from "./vaults";

const ROOT = join(import.meta.dir, ".tmp-vaults-v2-test");
const VAULTS = join(ROOT, "vaults");
const WRITABLE = join(ROOT, "agent-state");
const OUTSIDE = join(ROOT, "outside");

beforeAll(() => {
  mkdirSync(join(VAULTS, "skills", "coding", "git"), { recursive: true });
  mkdirSync(join(VAULTS, "projects"), { recursive: true });
  mkdirSync(join(VAULTS, "personal"), { recursive: true });
  mkdirSync(join(VAULTS, ".git"), { recursive: true });
  mkdirSync(join(WRITABLE, "handoffs"), { recursive: true });
  mkdirSync(OUTSIDE, { recursive: true });

  writeFileSync(join(VAULTS, "AGENTS.md"), "# Conduct Rules\n");
  writeFileSync(join(VAULTS, "skills", "coding", "git", "SKILL.md"), "# Git Skill\n");
  writeFileSync(join(VAULTS, "skills", "coding", "big.md"), "A".repeat(200));
  writeFileSync(join(VAULTS, "projects", "ACTIVE.md"), "# Active Projects\n");
  writeFileSync(join(VAULTS, "personal", "diary.md"), "top secret personal diary\n");
  writeFileSync(join(VAULTS, "secret.txt"), "non-markdown");
  writeFileSync(join(VAULTS, ".env"), "SECRET=123\n");
  writeFileSync(join(VAULTS, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(WRITABLE, "handoffs", "app.md"), "# App Handoff\n");

  writeFileSync(join(OUTSIDE, "escape.md"), "# Escaped Secret\n");
  symlinkSync(join(OUTSIDE, "escape.md"), join(VAULTS, "projects", "escape-link.md"));
  symlinkSync(OUTSIDE, join(VAULTS, "projects", "escape-dir"));
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("resolveSafeFile", () => {
  test("blocks symlink pointing outside root without leaking host paths", async () => {
    await expect(resolveSafeFile(VAULTS, "projects/escape-link.md")).rejects.toThrow(
      /outside root/i,
    );
    await expect(resolveSafeFile(VAULTS, "projects/escape-dir/escape.md")).rejects.toThrow(
      /outside root/i,
    );
  });
});

describe("makeVaultStore", () => {
  const store = makeVaultStore({ vaultsRoot: VAULTS, writableRoot: WRITABLE });

  test("listEntries hides personal/**, dotfiles, non-md files, and symlink escapes", async () => {
    const res = await store.listEntries(["*"], { depth: 3 });
    const filePaths = res.files.map((f) => f.path);
    const dirPaths = res.directories.map((d) => d.path);

    expect(filePaths).toContain("AGENTS.md");
    expect(filePaths).toContain("projects/ACTIVE.md");
    expect(filePaths).toContain("agents/handoffs/app.md");
    expect(filePaths.some((p) => p.includes("personal"))).toBe(false);
    expect(filePaths.some((p) => p.includes("escape"))).toBe(false);
    expect(filePaths.some((p) => p.includes(".env") || p.includes(".git"))).toBe(false);
    expect(filePaths.some((p) => p.endsWith(".txt"))).toBe(false);
    expect(dirPaths).toContain("skills");
    expect(dirPaths).toContain("skills/coding");
    expect(dirPaths.some((d) => d.includes("personal"))).toBe(false);
  });

  test("listEntries progressive disclosure respects depth and prefix", async () => {
    const shallow = await store.listEntries(["*"], { depth: 1 });
    expect(shallow.files.map((f) => f.path)).toEqual(["AGENTS.md"]);
    expect(shallow.directories).toEqual([
      { path: "agents", fileCount: 1 },
      { path: "projects", fileCount: 1 },
      { path: "skills", fileCount: 2 },
    ]);

    const skillsOnly = await store.listEntries(["*"], { prefix: "skills/coding", depth: 2 });
    expect(skillsOnly.files.map((f) => f.path)).toEqual([
      "skills/coding/big.md",
      "skills/coding/git/SKILL.md",
    ]);
  });

  test("readMarkdown enforces scopes, blocks personal/**, truncates by byte budget, and reads writable overlay", async () => {
    const handoff = await store.readMarkdown(["*"], "agents/handoffs/app.md");
    expect(handoff.content).toBe("# App Handoff\n");
    expect(handoff.truncated).toBe(false);

    const bounded = await store.readMarkdown(["*"], "skills/coding/big.md", 64);
    expect(bounded.bytes).toBe(64);
    expect(bounded.totalBytes).toBe(200);
    expect(bounded.truncated).toBe(true);

    await expect(store.readMarkdown(["*"], "personal/diary.md")).rejects.toThrow(/forbidden/i);
    await expect(
      store.readMarkdown(["vault:read:personal/**", PERSONAL_OPT_IN_SCOPE], "personal/diary.md"),
    ).resolves.toMatchObject({ content: "top secret personal diary\n" });
    await expect(store.readMarkdown(["*"], "secret.txt")).rejects.toThrow(/only markdown/i);
    await expect(store.readMarkdown(["*"], "projects/escape-link.md")).rejects.toThrow(
      /outside root/i,
    );
  });
});
