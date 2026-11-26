import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_WRITE_BYTES, makeSandboxedWriter } from "./writer";

const ROOT = mkdtempSync(join(tmpdir(), "cardinal-writer-test-"));
const WRITABLE = join(ROOT, "agent-state");
const OUTSIDE = join(ROOT, "outside");

beforeAll(() => {
  mkdirSync(WRITABLE, { recursive: true });
  mkdirSync(OUTSIDE, { recursive: true });
  writeFileSync(join(OUTSIDE, "pwn.md"), "outside");
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("makeSandboxedWriter", () => {
  const writer = makeSandboxedWriter({ writableRoot: WRITABLE, gitAutoCommit: false });

  test("writes bounded handoff markdown and returns logical agents/handoffs path", async () => {
    const res = await writer.writeHandoff({
      agent: "coder-1",
      project: "my-app",
      summary: "Implemented auth middleware.",
      nextSteps: ["Run integration tests"],
      refs: ["src/auth.ts"],
    });
    expect(res).toMatchObject({
      path: "agents/handoffs/my-app.md",
      committed: false,
    });
    expect(res.bytes).toBeGreaterThan(20);
    const text = readFileSync(join(WRITABLE, "handoffs", "my-app.md"), "utf8");
    expect(text).toContain("# Handoff: my-app");
    expect(text).toContain("Implemented auth middleware.");
    expect(text).toContain("- Run integration tests");
  });

  test("writes skill proposal with sanitized filename", async () => {
    const res = await writer.writeSkillProposal({
      agent: "coder-1",
      skillPath: "skills/coding/git/SKILL.md",
      reason: "Clarify rebase safety check",
      content: "# Git Skill\nNever force push main.",
    });
    expect(res.path.startsWith("agents/proposals/")).toBe(true);
    expect(res.path.endsWith(".md")).toBe(true);
    const fileOnDisk = join(WRITABLE, res.path.slice("agents/".length));
    expect(readFileSync(fileOnDisk, "utf8")).toContain("Clarify rebase safety check");
  });

  test("rejects invalid slugs, traversal skill paths, and oversize payloads", async () => {
    await expect(
      writer.writeHandoff({ agent: "a", project: "../evil", summary: "x" }),
    ).rejects.toThrow(/slug/i);
    await expect(
      writer.writeHandoff({ agent: "a", project: "Bad Space", summary: "x" }),
    ).rejects.toThrow(/slug/i);
    await expect(
      writer.writeSkillProposal({
        agent: "a",
        skillPath: "../personal/secret.md",
        reason: "r",
        content: "c",
      }),
    ).rejects.toThrow();
    await expect(
      writer.writeHandoff({
        agent: "a",
        project: "oversize",
        summary: "X".repeat(MAX_WRITE_BYTES + 100),
      }),
    ).rejects.toThrow(/max write limit/i);
  });

  test("rejects writing into a symlink target", async () => {
    symlinkSync(join(OUTSIDE, "pwn.md"), join(WRITABLE, "handoffs", "linked.md"));
    await expect(
      writer.writeHandoff({ agent: "a", project: "linked", summary: "nope" }),
    ).rejects.toThrow(/not a regular file/i);
  });

  test("gitAutoCommit commits only the written file and degrades gracefully when git is missing", async () => {
    const gitRoot = join(ROOT, "git-state");
    mkdirSync(join(gitRoot, ".git"), { recursive: true });

    const calls: string[][] = [];
    const mockedWriter = makeSandboxedWriter({
      writableRoot: gitRoot,
      gitAutoCommit: true,
      runGit: async (args) => {
        calls.push(args);
        // `git diff --cached --quiet` returns 1 when staged changes exist.
        if (args[0] === "diff") return 1;
        return 0;
      },
    });
    const committedRes = await mockedWriter.writeHandoff({
      agent: "coder-1",
      project: "my-repo",
      summary: "Staged single file only.",
    });
    expect(committedRes.committed).toBe(true);
    expect(calls).toEqual([
      ["add", "--", "handoffs/my-repo.md"],
      ["diff", "--cached", "--quiet", "--", "handoffs/my-repo.md"],
      ["commit", "--no-gpg-sign", "-m", "chore(handoff): update my-repo by coder-1"],
    ]);

    const realWriter = makeSandboxedWriter({ writableRoot: gitRoot, gitAutoCommit: true });
    const res = await realWriter.writeHandoff({
      agent: "coder-1",
      project: "graceful",
      summary: "Works with or without git binary in container",
    });
    expect(res.path).toBe("agents/handoffs/graceful.md");
    expect(typeof res.committed).toBe("boolean");
  });

  test("aborts and writes nothing when assertAllowed throws", async () => {
    let capturedPath = "";
    await expect(
      writer.writeHandoff({
        agent: "coder-1",
        project: "blocked-project",
        summary: "Should not be written.",
        assertAllowed: (logicalPath) => {
          capturedPath = logicalPath;
          throw new Error("denied by assertAllowed");
        },
      }),
    ).rejects.toThrow("denied by assertAllowed");

    expect(capturedPath).toBe("agents/handoffs/blocked-project.md");
    expect(existsSync(join(WRITABLE, "handoffs", "blocked-project.md"))).toBe(false);

    let capturedProposalPath = "";
    await expect(
      writer.writeSkillProposal({
        agent: "coder-1",
        skillPath: "skills/coding/git/SKILL.md",
        reason: "Test assertAllowed",
        content: "Should not be written.",
        assertAllowed: (logicalPath) => {
          capturedProposalPath = logicalPath;
          throw new Error("proposal denied by assertAllowed");
        },
      }),
    ).rejects.toThrow("proposal denied by assertAllowed");

    expect(capturedProposalPath.startsWith("agents/proposals/")).toBe(true);
    expect(
      existsSync(join(WRITABLE, capturedProposalPath.slice("agents/".length))),
    ).toBe(false);
  });
});
