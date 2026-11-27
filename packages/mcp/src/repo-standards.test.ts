import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOGFOOD_OPTIONS, DOGFOOD_PATHS } from "../../../scripts/sync-repo-standards";
import {
  REPO_STANDARDS_VERSION,
  buildRepoStandardsBlueprint,
  renderRepoStandardsMarkdown,
} from "./repo-standards";

const REPO_ROOT = resolve(import.meta.dir, "../../..");

const paths = (bp: ReturnType<typeof buildRepoStandardsBlueprint>) => bp.files.map((f) => f.path);
const content = (bp: ReturnType<typeof buildRepoStandardsBlueprint>, p: string) =>
  bp.files.find((f) => f.path === p)?.content ?? "";

describe("buildRepoStandardsBlueprint", () => {
  test("lite tier ships four files on a single main branch with no hooks", () => {
    const bp = buildRepoStandardsBlueprint({ scope: "lite", project: "dotfiles" });
    expect(bp.standardsVersion).toBe(REPO_STANDARDS_VERSION);
    expect(bp.hooks).toBe("none");
    expect(bp.defaultBranch).toBe("main");
    expect(paths(bp)).toEqual(["README.md", "AGENTS.md", "CLAUDE.md", ".gitignore"]);
    expect(content(bp, "CLAUDE.md")).toBe("@AGENTS.md\n");
    expect(content(bp, "AGENTS.md")).toContain("merge into `main`");
    expect(content(bp, "AGENTS.md")).not.toContain("install-hooks");
  });

  test("standard tier ships modular rules, templates, verify gate, skills, and light hooks", () => {
    const bp = buildRepoStandardsBlueprint({ project: "my-app", stack: "TypeScript, Bun" });
    expect(bp.scope).toBe("standard");
    expect(bp.hooks).toBe("light");
    expect(bp.defaultBranch).toBe("dev");
    expect(bp.files).toHaveLength(22);
    for (const p of [
      "AGENTS/commits.md",
      "AGENTS/branching.md",
      "docs/agents/issue-tracker.md",
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/ISSUE_TEMPLATE/idea.md",
      "scripts/verify.sh",
      ".agents/skills/README.md",
      ".githooks/pre-commit",
      "scripts/install-hooks.sh",
    ]) {
      expect(paths(bp)).toContain(p);
    }
    for (const p of [".githooks/commit-msg", "SECURITY.md", ".github/workflows/ci.yml", "GLOSSARY.md"]) {
      expect(paths(bp)).not.toContain(p);
    }
    const hook = content(bp, ".githooks/pre-commit");
    expect(hook).toContain("main|master|dev)");
    expect(hook).not.toContain("(home|Users)");
    expect(content(bp, "AGENTS.md")).toContain("[`AGENTS/security.md`](AGENTS/security.md)");
    expect(content(bp, "AGENTS.md")).toContain("`grilling`");
  });

  test("full tier adds security policy, CI, glossary, ADR, and commit-msg hook", () => {
    const bp = buildRepoStandardsBlueprint({ scope: "full", stack: "Go" });
    expect(bp.hooks).toBe("full");
    expect(bp.files).toHaveLength(28);
    for (const p of [
      "SECURITY.md",
      ".github/ISSUE_TEMPLATE/config.yml",
      ".github/workflows/ci.yml",
      "GLOSSARY.md",
      "docs/adr/0001-record-architecture-decisions.md",
      ".githooks/commit-msg",
    ]) {
      expect(paths(bp)).toContain(p);
    }
    expect(content(bp, ".githooks/pre-commit")).toContain("(home|Users)");
    expect(content(bp, ".github/workflows/ci.yml")).toContain("actions/setup-go@v5");
    expect(content(bp, "README.md")).toContain("## Security");
  });

  test("executable flags cover hooks and scripts only", () => {
    const bp = buildRepoStandardsBlueprint({ scope: "full" });
    expect(bp.files.filter((f) => f.executable).map((f) => f.path).sort()).toEqual([
      ".githooks/commit-msg",
      ".githooks/pre-commit",
      "scripts/install-hooks.sh",
      "skills/sync-skills.sh",
      "scripts/verify.sh",
    ].sort());
  });

  test("hooks override and main-only branching adapt files and docs", () => {
    const liteWithHooks = buildRepoStandardsBlueprint({ scope: "lite", hooks: "light" });
    expect(paths(liteWithHooks)).toContain(".githooks/pre-commit");
    expect(content(liteWithHooks, ".githooks/pre-commit")).toContain("main|master)");

    const standardNoHooks = buildRepoStandardsBlueprint({ hooks: "none" });
    expect(paths(standardNoHooks).some((p) => p.startsWith(".githooks/"))).toBe(false);
    expect(paths(standardNoHooks)).not.toContain("scripts/install-hooks.sh");

    const mainOnly = buildRepoStandardsBlueprint({ defaultBranch: "main" });
    expect(content(mainOnly, "AGENTS/branching.md")).toContain("──PR──▶  main");
    expect(content(mainOnly, "AGENTS/branching.md")).not.toContain("release PR");
  });

  test("stack keywords drive CI toolchain setup", () => {
    const ci = (stack: string) =>
      content(buildRepoStandardsBlueprint({ scope: "full", stack }), ".github/workflows/ci.yml");
    expect(ci("TypeScript, Bun")).toContain("oven-sh/setup-bun@v2");
    expect(ci("TypeScript, Bun")).not.toContain("setup-node");
    expect(ci("React, Vite")).toContain("actions/setup-node@v4");
    expect(ci("Python, FastAPI")).toContain("actions/setup-python@v5");
    expect(ci("Django")).not.toContain("setup-go");
    expect(ci("Rust")).toContain("dtolnay/rust-toolchain@stable");
    expect(ci("")).toContain("# Add this repo's toolchain setup here");
  });

  test("invalid project slugs and branch names fall back safely", () => {
    const bp = buildRepoStandardsBlueprint({ project: "../escape", defaultBranch: "bad;rm -rf" });
    expect(bp.project).toBe("<project-name>");
    expect(bp.defaultBranch).toBe("dev");
  });

  test("markdown render includes scope guide, rules, checklist, and nested fences", () => {
    const md = renderRepoStandardsMarkdown(buildRepoStandardsBlueprint({ project: "alpha" }));
    expect(md).toContain("### Scope guide");
    expect(md).toContain("**`standard`** (selected)");
    expect(md).toContain("### Anti-Drift Rules");
    expect(md).toContain("### Compliance Checklist");
    expect(md).toContain("#### `.githooks/pre-commit` (executable)");
    expect(md).toContain("````markdown");
  });

  test("dogfood parity: cardinal-system hook files match the full-tier blueprint", () => {
    const bp = buildRepoStandardsBlueprint(DOGFOOD_OPTIONS);
    for (const rel of DOGFOOD_PATHS) {
      expect(readFileSync(resolve(REPO_ROOT, rel), "utf8")).toBe(content(bp, rel));
    }
  });
});
