import { describe, expect, test } from "bun:test";
import {
  canReadAnyVault,
  canReadConfig,
  canReadConfigCategory,
  canReadPath,
  canWritePath,
  canWritePrefix,
  hasServiceScope,
  isDeniedPath,
  matchGlob,
  normalizePrefix,
  normalizeRelativePath,
  PERSONAL_OPT_IN_SCOPE,
} from "./acl";

describe("normalizeRelativePath", () => {
  test("normalizes valid POSIX relative paths", () => {
    expect(normalizeRelativePath("AGENTS.md")).toBe("AGENTS.md");
    expect(normalizeRelativePath("skills/coding/git/SKILL.md")).toBe("skills/coding/git/SKILL.md");
  });

  test("rejects traversal, encodings, backslashes, null bytes, and dotfiles", () => {
    const badInputs = [
      "",
      "   ",
      " leading.md",
      "trailing.md ",
      "/etc/passwd",
      "~/secret.md",
      "C:\\secret.md",
      "skills\\coding\\a.md",
      "../personal/notes.md",
      "skills/../../etc/passwd",
      "skills/./note.md",
      "skills//note.md",
      "skills/coding/",
      "skills/%2e%2e/personal/a.md",
      "skills/%2E%2E%2Fpersonal/a.md",
      "%252e%252e/personal/a.md",
      "skills/a%00.md",
      "skills/a\0.md",
      ".git/config",
      "skills/.env",
      "vault/.obsidian/workspace.json",
    ];
    for (const input of badInputs) {
      expect(() => normalizeRelativePath(input)).toThrow();
    }
  });

  test("normalizePrefix handles empty and trailing slash cleanly", () => {
    expect(normalizePrefix(undefined)).toBe("");
    expect(normalizePrefix("  ")).toBe("");
    expect(normalizePrefix("skills/coding/")).toBe("skills/coding");
    expect(() => normalizePrefix("../escape")).toThrow();
  });
});

describe("matchGlob", () => {
  test("supports *, ?, and ** across nested segments", () => {
    expect(matchGlob("skills/coding/**", "skills/coding/git/SKILL.md")).toBe(true);
    expect(matchGlob("skills/coding/**", "skills/coding/readme.md")).toBe(true);
    expect(matchGlob("skills/coding/**", "skills/coding")).toBe(true);
    expect(matchGlob("skills/coding/**", "skills/personal/diary.md")).toBe(false);
    expect(matchGlob("skills/*/SKILL.md", "skills/git/SKILL.md")).toBe(true);
    expect(matchGlob("skills/*/SKILL.md", "skills/coding/git/SKILL.md")).toBe(false);
    expect(matchGlob("notes/v?.md", "notes/v1.md")).toBe(true);
    expect(matchGlob("notes/v?.md", "notes/v10.md")).toBe(false);
  });

  test("handles long pathological wildcard patterns quickly without ReDoS", () => {
    const start = Date.now();
    const pattern = "a/**/**/**/**/b/*/*/*/*/*c";
    const path = "a/x/y/z/w/p/q/r/s/t/nope";
    expect(matchGlob(pattern, path)).toBe(false);
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe("canReadPath & personal/** protection", () => {
  test("personal/** is unconditionally denied even with wildcard *", () => {
    expect(isDeniedPath("personal/diary.md")).toBe(true);
    expect(isDeniedPath("Personal/diary.md")).toBe(true);
    expect(canReadPath(["*"], "personal/diary.md")).toBe(false);
    expect(canReadPath(["*"], "personal/mails/inbox.md")).toBe(false);
    expect(canReadPath(["*"], "skills/coding/git/SKILL.md")).toBe(true);
  });

  test("personal/** requires both PERSONAL_OPT_IN_SCOPE and an explicit read scope", () => {
    expect(canReadPath(["vault:read:personal/**"], "personal/diary.md")).toBe(false);
    expect(canReadPath([PERSONAL_OPT_IN_SCOPE], "personal/diary.md")).toBe(false);
    expect(canReadPath([PERSONAL_OPT_IN_SCOPE, "*"], "personal/diary.md")).toBe(false);
    expect(
      canReadPath([PERSONAL_OPT_IN_SCOPE, "vault:read:personal/**"], "personal/diary.md"),
    ).toBe(true);
  });

  test("coding scopes allow nested SKILL.md and block personal paths", () => {
    const codingScopes = [
      "vault:read:cardinal-system/**",
      "vault:read:skills/coding/**",
      "vault:read:projects/**",
      "vault:write:agents/handoffs/**",
    ];
    expect(canReadPath(codingScopes, "skills/coding/git/SKILL.md")).toBe(true);
    expect(canReadPath(codingScopes, "projects/ACTIVE.md")).toBe(true);
    expect(canReadPath(codingScopes, "skills/personal/notes.md")).toBe(false);
    expect(canReadPath(codingScopes, "personal/secrets.md")).toBe(false);
    expect(canReadPath(codingScopes, "../personal/secrets.md")).toBe(false);
  });

  test("legacy vault:<name> scopes allow reads inside <name>/** except denied prefixes without opt-in", () => {
    expect(canReadPath(["vault:the portal"], "the portal/index.md")).toBe(true);
    expect(canReadPath(["vault:the portal"], "for-my-agents/tasks.md")).toBe(false);
    expect(canReadPath(["vault:personal"], "personal/note.md")).toBe(false);
    expect(canReadPath(["vault:personal", PERSONAL_OPT_IN_SCOPE], "personal/note.md")).toBe(true);
  });
});

describe("canWritePath & service scopes", () => {
  test("wildcard * and legacy vault:* never grant write access", () => {
    expect(canWritePath(["*"], "agents/handoffs/demo.md")).toBe(false);
    expect(canWritePath(["vault:agents"], "agents/handoffs/demo.md")).toBe(false);
    expect(canWritePath(["vault:read:agents/**"], "agents/handoffs/demo.md")).toBe(false);
  });

  test("explicit vault:write:<glob> allows matching non-denied paths only", () => {
    const scopes = ["vault:write:agents/handoffs/**", "vault:write:agents/proposals/**"];
    expect(canWritePath(scopes, "agents/handoffs/app.md")).toBe(true);
    expect(canWritePath(scopes, "agents/proposals/2026-11-25-git.md")).toBe(true);
    expect(canWritePath(scopes, "skills/coding/git/SKILL.md")).toBe(false);
  });

  test("personal/** is ALWAYS write-denied regardless of scopes", () => {
    expect(
      canWritePath(
        ["*", PERSONAL_OPT_IN_SCOPE, "vault:write:personal/**", "vault:write:**"],
        "personal/diary.md",
      ),
    ).toBe(false);
  });

  test("canReadAnyVault and canWritePrefix accurately gate tool visibility", () => {
    expect(canReadAnyVault([])).toBe(false);
    expect(canReadAnyVault(["board:read"])).toBe(false);
    expect(canReadAnyVault(["vault:read:personal/**"])).toBe(false);
    expect(canReadAnyVault(["vault:read:personal/**", PERSONAL_OPT_IN_SCOPE])).toBe(true);
    expect(canReadAnyVault(["vault:read:skills/coding/**"])).toBe(true);
    expect(canReadAnyVault(["*"])).toBe(true);

    expect(canWritePrefix(["*"], "agents/handoffs")).toBe(false);
    expect(canWritePrefix(["vault:write:personal/**"], "personal")).toBe(false);
    expect(canWritePrefix(["vault:write:agents/handoffs/**"], "agents/handoffs")).toBe(true);
    expect(canWritePrefix(["vault:write:agents/handoffs/demo.md"], "agents/handoffs")).toBe(true);
    expect(canWritePrefix(["vault:write:agents/proposals/**"], "agents/handoffs")).toBe(false);
  });

  test("hasServiceScope detects board and mailbox permissions", () => {
    expect(hasServiceScope(["*"], "board")).toBe(true);
    expect(hasServiceScope(["board:read"], "board")).toBe(true);
    expect(hasServiceScope(["board:write"], "board")).toBe(true);
    expect(hasServiceScope(["mailbox:read"], "board")).toBe(false);
    expect(hasServiceScope(["mailbox:write"], "mailbox")).toBe(true);
  });

  test("canReadConfig enforces agents vs strict user opt-in", () => {
    expect(canReadConfig(["*"], "agents", "opencode/opencode.json")).toBe(true);
    expect(canReadConfig(["config:read:agents/**"], "agents", "omp/config.toml")).toBe(true);
    expect(canReadConfig(["config:read:agents/opencode/**"], "agents", "omp/config.toml")).toBe(false);
    expect(canReadConfig(["board:read"], "agents", "opencode/opencode.json")).toBe(false);

    // Wildcards must NEVER grant access to user/** configs.
    expect(canReadConfig(["*"], "user", "kitty/kitty.conf")).toBe(false);
    expect(canReadConfig(["config:read:*"], "user", "kitty/kitty.conf")).toBe(false);
    expect(canReadConfig(["config:read:**"], "user", "kitty/kitty.conf")).toBe(false);
    expect(canReadConfig(["config:read:agents/**"], "user", "kitty/kitty.conf")).toBe(false);

    // Explicit config:read:user/** opt-in succeeds (while rejecting traversal/dotfiles).
    expect(canReadConfig(["config:read:user/**"], "user", "kitty/kitty.conf")).toBe(true);
    expect(canReadConfig(["config:read:user/kitty/*"], "user", "kitty/kitty.conf")).toBe(true);
    expect(canReadConfig(["config:read:user/kitty/*"], "user", "zsh/zshrc")).toBe(false);
    expect(canReadConfig(["config:read:user/**"], "user", "../agents/opencode.json")).toBe(false);
    expect(canReadConfig(["config:read:user/**"], "user", ".env")).toBe(false);

    expect(canReadConfigCategory(["*"], "agents")).toBe(true);
    expect(canReadConfigCategory(["*"], "user")).toBe(false);
    expect(canReadConfigCategory(["config:read:user/**"], "user")).toBe(true);
    expect(canReadConfigCategory(["config:read:user/kitty/*"], "user")).toBe(true);
  });
});
