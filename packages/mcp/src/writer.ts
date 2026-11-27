import { existsSync } from "node:fs";
import { lstat, mkdir, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { normalizeRelativePath } from "./acl";

export const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const MAX_WRITE_BYTES = 16_384;

export type GitRunner = (
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
) => Promise<number>;

export interface SandboxedWriterOptions {
  writableRoot: string;
  gitAutoCommit?: boolean;
  runGit?: GitRunner;
}

export interface HandoffWriteInput {
  agent: string;
  project: string;
  summary: string;
  nextSteps?: string[];
  refs?: string[];
  assertAllowed?: (logicalPath: string) => void;
}

export interface SkillProposalWriteInput {
  agent: string;
  skillPath: string;
  reason: string;
  content: string;
  assertAllowed?: (logicalPath: string) => void;
}

export interface WriteResult {
  path: string;
  bytes: number;
  committed: boolean;
}

export class WriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriterError";
  }
}

async function assertRealDirectory(dir: string): Promise<string> {
  const info = await lstat(dir).catch(() => null);
  if (info === null || info.isSymbolicLink() || !info.isDirectory()) {
    throw new WriterError("writable root unavailable");
  }
  return realpath(dir);
}

function toSafeSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "skill";
}

export function makeSandboxedWriter(options: SandboxedWriterOptions) {
  const { writableRoot, gitAutoCommit = true, runGit } = options;

  async function execGit(
    gitBin: string,
    args: string[],
    cwd: string,
    env: Record<string, string | undefined>,
  ): Promise<number> {
    if (runGit) return runGit(args, cwd, env);
    const proc = Bun.spawn([gitBin, ...args], {
      cwd,
      env,
      stdout: "ignore",
      stderr: "ignore",
    });
    return proc.exited;
  }

  async function tryGitCommit(relPathWithinRoot: string, commitMessage: string): Promise<boolean> {
    if (!gitAutoCommit) return false;
    if (!existsSync(join(writableRoot, ".git"))) return false;
    const gitBin = runGit ? "git" : Bun.which("git");
    if (!gitBin) return false;

    const env = {
      ...process.env,
      GIT_CEILING_DIRECTORIES: dirname(resolve(writableRoot)),
      GIT_AUTHOR_NAME: "Cardinal Context Hub",
      GIT_AUTHOR_EMAIL: "cardinal@local",
      GIT_COMMITTER_NAME: "Cardinal Context Hub",
      GIT_COMMITTER_EMAIL: "cardinal@local",
    };

    try {
      const addCode = await execGit(gitBin, ["add", "--", relPathWithinRoot], writableRoot, env);
      if (addCode !== 0) return false;

      const diffCode = await execGit(
        gitBin,
        ["diff", "--cached", "--quiet", "--", relPathWithinRoot],
        writableRoot,
        env,
      );
      if (diffCode === 0) return false;

      const commitCode = await execGit(
        gitBin,
        ["commit", "--no-gpg-sign", "-m", commitMessage],
        writableRoot,
        env,
      );
      return commitCode === 0;
    } catch {
      return false;
    }
  }

  async function writeAtomic(
    subDir: "handoffs" | "proposals",
    filename: string,
    markdown: string,
  ): Promise<{ bytes: number; relInsideRoot: string }> {
    const bytes = Buffer.byteLength(markdown, "utf8");
    if (bytes > MAX_WRITE_BYTES) {
      throw new WriterError(`payload exceeds max write limit (${MAX_WRITE_BYTES} bytes)`);
    }

    const realRoot = await assertRealDirectory(writableRoot);
    const rootPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;

    const targetDir = join(realRoot, subDir);
    const existingDir = await lstat(targetDir).catch(() => null);
    if (existingDir === null) {
      await mkdir(targetDir, { recursive: true });
    } else if (existingDir.isSymbolicLink() || !existingDir.isDirectory()) {
      throw new WriterError("forbidden: target directory is not a regular directory");
    }

    const realTargetDir = await realpath(targetDir);
    if (!realTargetDir.startsWith(rootPrefix)) {
      throw new WriterError("forbidden: target directory escapes root");
    }

    const targetFile = join(realTargetDir, filename);
    const existingFile = await lstat(targetFile).catch(() => null);
    if (existingFile !== null && (existingFile.isSymbolicLink() || !existingFile.isFile())) {
      throw new WriterError("forbidden: target file is not a regular file");
    }

    const tmpFile = join(realTargetDir, `.${filename}.${crypto.randomUUID()}.tmp`);
    await writeFile(tmpFile, markdown, "utf8");
    await rename(tmpFile, targetFile);

    return { bytes, relInsideRoot: `${subDir}/${filename}` };
  }

  async function writeHandoff(input: HandoffWriteInput): Promise<WriteResult> {
    if (!SLUG_RE.test(input.project)) {
      throw new WriterError(
        "invalid project slug (must match /^[a-z0-9][a-z0-9._-]{0,63}$/)",
      );
    }

    const now = new Date().toISOString();
    const lines = [
      `# Handoff: ${input.project}`,
      "",
      `- **Agent:** ${input.agent}`,
      `- **Updated:** ${now}`,
      "",
      "## Summary",
      input.summary.trim(),
    ];

    if (input.nextSteps && input.nextSteps.length > 0) {
      lines.push("", "## Next Steps");
      for (const step of input.nextSteps) {
        lines.push(`- ${step.trim()}`);
      }
    }

    if (input.refs && input.refs.length > 0) {
      lines.push("", "## References");
      for (const ref of input.refs) {
        lines.push(`- ${ref.trim()}`);
      }
    }

    const markdown = `${lines.join("\n")}\n`;
    const filename = `${input.project}.md`;
    const logicalPath = `agents/handoffs/${filename}`;
    input.assertAllowed?.(logicalPath);
    const { bytes, relInsideRoot } = await writeAtomic("handoffs", filename, markdown);
    const committed = await tryGitCommit(
      relInsideRoot,
      `chore(handoff): update ${input.project} by ${input.agent}`,
    );

    return {
      path: `agents/${relInsideRoot}`,
      bytes,
      committed,
    };
  }

  async function writeSkillProposal(input: SkillProposalWriteInput): Promise<WriteResult> {
    let cleanSkillPath: string;
    try {
      cleanSkillPath = normalizeRelativePath(input.skillPath);
    } catch (err) {
      throw new WriterError(err instanceof Error ? err.message : "invalid skill_path");
    }

    const now = new Date().toISOString();
    const datePrefix = now.slice(0, 10);
    const shortId = crypto.randomUUID().slice(0, 8);
    const slug = toSafeSlug(cleanSkillPath);
    const filename = `${datePrefix}-${slug}-${shortId}.md`;
    const logicalPath = `agents/proposals/${filename}`;
    input.assertAllowed?.(logicalPath);

    const markdown = [
      `# Skill Proposal: ${cleanSkillPath}`,
      "",
      `- **Agent:** ${input.agent}`,
      `- **Created:** ${now}`,
      `- **Target:** \`${cleanSkillPath}\``,
      "",
      "## Reason",
      input.reason.trim(),
      "",
      "## Proposed Content",
      input.content.trim(),
      "",
    ].join("\n");

    const { bytes, relInsideRoot } = await writeAtomic("proposals", filename, markdown);
    const committed = await tryGitCommit(
      relInsideRoot,
      `docs(proposal): ${slug} by ${input.agent}`,
    );

    return {
      path: `agents/${relInsideRoot}`,
      bytes,
      committed,
    };
  }

  return {
    writeHandoff,
    writeSkillProposal,
  };
}

export type SandboxedWriter = ReturnType<typeof makeSandboxedWriter>;
