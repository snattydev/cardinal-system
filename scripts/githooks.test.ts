import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildRepoStandardsBlueprint } from "../packages/mcp/src/repo-standards";

const REPO_ROOT = resolve(import.meta.dir, "..");
const PRE_COMMIT = join(REPO_ROOT, ".githooks/pre-commit");
const COMMIT_MSG = join(REPO_ROOT, ".githooks/commit-msg");
const INSTALL_HOOKS = join(REPO_ROOT, "scripts/install-hooks.sh");

// Fake git: the bun container image ships without git, and hooks only need a few subcommands.
const GIT_SHIM = `#!/usr/bin/env bash
if [ "$1" = "-C" ]; then shift 2; fi
case "$1" in
  rev-parse)
    if [ "$2" = "--show-toplevel" ]; then
      [ -n "\${FAKE_ROOT:-}" ] || exit 128
      echo "$FAKE_ROOT"
      exit 0
    fi
    echo "\${FAKE_GIT_DIR:-.git}"
    exit 0
    ;;
  symbolic-ref) echo "\${FAKE_BRANCH:-feature/demo}" ;;
  config) echo "$*" >> "$FAKE_LOG" ;;
  diff)
    if [[ " $* " == *" --name-only "* ]]; then
      [ -f "\${FAKE_STAGED:-}" ] && cat "$FAKE_STAGED"
      exit 0
    fi
    file="\${@: -1}"
    echo "+++ b/$file"
    [ -f "$FAKE_ADDED/$file" ] && sed 's/^/+/' "$FAKE_ADDED/$file"
    ;;
esac
exit 0
`;

let sandbox: string;
let shimDir: string;
let caseId = 0;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cardinal-githooks-"));
  shimDir = join(sandbox, "bin");
  mkdirSync(shimDir, { recursive: true });
  writeFileSync(join(shimDir, "git"), GIT_SHIM);
  chmodSync(join(shimDir, "git"), 0o755);
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

interface PreCommitCase {
  branch?: string;
  staged?: Record<string, string>;
  env?: Record<string, string>;
  mergeHead?: boolean;
  allowlist?: string;
  hook?: string;
}

function runPreCommit(opts: PreCommitCase) {
  const work = join(sandbox, `case-${caseId++}`);
  const gitDir = join(work, ".git");
  const added = join(work, "added");
  mkdirSync(gitDir, { recursive: true });
  if (opts.mergeHead) writeFileSync(join(gitDir, "MERGE_HEAD"), "abc\n");
  if (opts.allowlist !== undefined) {
    mkdirSync(join(work, ".githooks"), { recursive: true });
    writeFileSync(join(work, ".githooks/secret-scan-allowlist"), opts.allowlist);
  }
  const staged = opts.staged ?? {};
  for (const [file, body] of Object.entries(staged)) {
    mkdirSync(dirname(join(added, file)), { recursive: true });
    writeFileSync(join(added, file), body);
  }
  writeFileSync(join(work, "staged.txt"), Object.keys(staged).join("\n") + (Object.keys(staged).length ? "\n" : ""));

  return spawnSync("bash", [opts.hook ?? PRE_COMMIT], {
    cwd: work,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      FAKE_BRANCH: opts.branch ?? "feature/demo",
      FAKE_GIT_DIR: gitDir,
      FAKE_STAGED: join(work, "staged.txt"),
      FAKE_ADDED: added,
      ...opts.env,
    },
  });
}

function runCommitMsg(message: string) {
  const file = join(sandbox, `msg-${caseId++}.txt`);
  writeFileSync(file, message);
  return spawnSync("bash", [COMMIT_MSG, file], { encoding: "utf8" });
}

const fakeToken = ["sk", "A".repeat(40)].join("-");
const pemHeader = ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ");
const hostHome = ["", "home", "alice", "project", "notes.txt"].join("/");
const containerHome = ["", "home", "node", ".cache", "qmd"].join("/");

describe(".githooks/pre-commit (full tier)", () => {
  test("blocks direct commits to main and dev unless overridden or merging", () => {
    expect(runPreCommit({ branch: "main" }).status).toBe(1);
    expect(runPreCommit({ branch: "dev" }).status).toBe(1);
    expect(runPreCommit({ branch: "main", env: { ALLOW_PROTECTED_COMMIT: "1" } }).status).toBe(0);
    expect(runPreCommit({ branch: "dev", mergeHead: true }).status).toBe(0);
    expect(runPreCommit({ branch: "feature/x" }).status).toBe(0);
  });

  test("blocks sensitive filenames and allows .env.example", () => {
    for (const file of [".env", "config/auth.json", "certs/server.key", ".ssh/id_ed25519", "data/app.sqlite"]) {
      const res = runPreCommit({ staged: { [file]: "x\n" } });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain(file);
    }
    expect(runPreCommit({ staged: { ".env.example": "API_KEY=\n" } }).status).toBe(0);
    expect(runPreCommit({ staged: { "src/author.json": "{}\n" } }).status).toBe(0);
  });

  test("blocks staged tokens, private keys, and host home paths", () => {
    expect(runPreCommit({ staged: { "src/a.ts": `const k = "${fakeToken}";\n` } }).status).toBe(1);
    expect(runPreCommit({ staged: { "src/b.txt": `${pemHeader}\n` } }).status).toBe(1);
    expect(runPreCommit({ staged: { "docs/c.md": `see ${hostHome}\n` } }).status).toBe(1);
  });

  test("allows clean changes, container paths, ignore markers, and allowlisted files", () => {
    expect(runPreCommit({ staged: { "src/ok.ts": "export const x = 1;\n" } }).status).toBe(0);
    expect(runPreCommit({ staged: { "compose.yaml": `cache: ${containerHome}/\n` } }).status).toBe(0);
    expect(
      runPreCommit({ staged: { "src/t.test.ts": `const k = "${fakeToken}"; // secret-scan:ignore\n` } }).status,
    ).toBe(0);
    expect(
      runPreCommit({
        staged: { "tests/fixtures/creds.ts": `export const k = "${fakeToken}";\n` },
        allowlist: "# fixtures\ntests/fixtures/*\n",
      }).status,
    ).toBe(0);
  });
});

describe("light-tier pre-commit from the blueprint", () => {
  test("lite repos with light hooks protect main only and skip the home-path scan", () => {
    const bp = buildRepoStandardsBlueprint({ scope: "lite", hooks: "light" });
    const hookPath = join(sandbox, "light-pre-commit");
    writeFileSync(hookPath, bp.files.find((f) => f.path === ".githooks/pre-commit")!.content);
    chmodSync(hookPath, 0o755);

    expect(runPreCommit({ hook: hookPath, branch: "main" }).status).toBe(1);
    expect(runPreCommit({ hook: hookPath, branch: "dev" }).status).toBe(0);
    expect(runPreCommit({ hook: hookPath, staged: { "docs/c.md": `see ${hostHome}\n` } }).status).toBe(0);
    expect(runPreCommit({ hook: hookPath, staged: { "src/a.ts": `"${fakeToken}"\n` } }).status).toBe(1);
  });
});

describe(".githooks/commit-msg", () => {
  test("accepts Conventional Commits, merges, reverts, and fixups", () => {
    for (const msg of [
      "feat(mcp): add repo standards blueprint\n\nBody text.\n",
      "fix!: drop legacy field\n",
      "chore(#12): bump deps\n",
      "Merge pull request #64 from snattydev/feature/mcp-context-hub\n",
      'Revert "feat: demo"\n',
      "fixup! feat: demo\n",
      "# comment line\ndocs: explain hooks\n",
      "test: cover hooks\n\n# ------------------------ >8 ------------------------\n+Co-Authored-By: Claude <noreply@anthropic.com>\n",
    ]) {
      const res = runCommitMsg(msg);
      expect({ msg, status: res.status, stderr: res.stderr }).toEqual({ msg, status: 0, stderr: "" });
    }
  });

  test("rejects non-conventional, oversized, empty, and AI-attributed messages", () => {
    for (const msg of [
      "updated stuff\n",
      `feat: ${"x".repeat(80)}\n`,
      "\n# only comments\n",
      "feat:missing space\n",
      "feat: add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n",
      "feat: add thing\n\nGenerated with Claude Code\n",
    ]) {
      expect({ msg, status: runCommitMsg(msg).status }).toEqual({ msg, status: 1 });
    }
  });
});

describe("scripts/install-hooks.sh", () => {
  test("sets core.hooksPath inside a repository and fails outside one", () => {
    const root = join(sandbox, "install-root");
    mkdirSync(join(root, ".githooks"), { recursive: true });
    writeFileSync(join(root, ".githooks/pre-commit"), "#!/usr/bin/env bash\n");
    writeFileSync(join(root, ".githooks/secret-scan-allowlist"), "# none\n");
    const log = join(sandbox, "install.log");
    const env = { ...process.env, PATH: `${shimDir}:${process.env.PATH}`, FAKE_LOG: log };

    const ok = spawnSync("bash", [INSTALL_HOOKS], { encoding: "utf8", env: { ...env, FAKE_ROOT: root } });
    expect(ok.status).toBe(0);
    expect(readFileSync(log, "utf8")).toContain("config core.hooksPath .githooks");

    const outside = spawnSync("bash", [INSTALL_HOOKS], { encoding: "utf8", env });
    expect(outside.status).toBe(1);
  });
});
