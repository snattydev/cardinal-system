import { SLUG_RE } from "./writer";

export const REPO_STANDARDS_VERSION = "1.0.0";

export type RepoScope = "lite" | "standard" | "full";
export type HookLevel = "none" | "light" | "full";

export const REPO_SCOPES: readonly RepoScope[] = ["lite", "standard", "full"];

export const DEFAULT_HOOKS_BY_SCOPE: Record<RepoScope, HookLevel> = {
  lite: "none",
  standard: "light",
  full: "full",
};

export const SCOPE_GUIDE: Record<RepoScope, string> = {
  lite: "Scripts, spikes, dotfiles, and small single-purpose tools: README + AGENTS.md + .gitignore, single `main` branch, no git hooks.",
  standard:
    "Real personal apps and libraries (default): modular AGENTS/ rules, GitHub issue/PR templates, verify gate, repo skills, `main` + `dev`, light secret/branch hook.",
  full: "Multi-module, security-sensitive, or long-lived systems: standard + SECURITY.md, CI workflow, GLOSSARY.md, ADRs, and full pre-commit + commit-msg hooks.",
};

export interface RepoStandardFile {
  path: string;
  executable?: boolean;
  purpose: string;
  content: string;
}

export interface RepoStandardsOptions {
  project?: string;
  stack?: string;
  scope?: RepoScope;
  hooks?: HookLevel | "auto";
  defaultBranch?: string;
}

export interface RepoStandardsBlueprint {
  standardsVersion: string;
  scope: RepoScope;
  hooks: HookLevel;
  project: string;
  stack: string;
  defaultBranch: string;
  antiDriftRules: string[];
  complianceChecklist: string[];
  files: RepoStandardFile[];
}

interface Ctx {
  project: string;
  stack: string;
  defaultBranch: string;
  scope: RepoScope;
  hooks: HookLevel;
}

/** Literal `$` for String.raw shell templates that need `${...}` parameter expansion. */
const D = "$";

const SAFE_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,63}$/;

function sanitizeProject(raw?: string): string {
  const trimmed = raw?.trim() ?? "";
  return trimmed !== "" && SLUG_RE.test(trimmed) ? trimmed : "<project-name>";
}

function sanitizeStack(raw?: string): string {
  const cleaned = (raw ?? "").replace(/[\r\n]+/g, " ").trim();
  return cleaned === "" ? "TBD" : cleaned;
}

function sanitizeBranch(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "" || trimmed.includes("..") || !SAFE_BRANCH_RE.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

export function resolveHookLevel(scope: RepoScope, hooks?: HookLevel | "auto"): HookLevel {
  if (hooks === "none" || hooks === "light" || hooks === "full") return hooks;
  return DEFAULT_HOOKS_BY_SCOPE[scope];
}

function protectedBranches(defaultBranch: string): string[] {
  return Array.from(new Set(["main", "master", defaultBranch]));
}

function usesDevFlow(c: Ctx): boolean {
  return c.defaultBranch !== "main" && c.defaultBranch !== "master";
}

// ---------------------------------------------------------------------------
// Git hooks and scripts (String.raw keeps shell backslashes verbatim)
// ---------------------------------------------------------------------------

function preCommitHook(c: Ctx): string {
  const branchCase = protectedBranches(c.defaultBranch).join("|");
  const homeScan =
    c.hooks === "full"
      ? String.raw`
  if grep -E '/(home|Users)/[A-Za-z0-9._-]+/' <<<"$added" | grep -Ev '/(home|Users)/(node|app|bun|runner|user|ubuntu|vscode|example|username|your-user)/' >/dev/null; then
    echo "pre-commit: absolute host home path in $file; use a relative path or placeholder." >&2
    status=1
  fi
`
      : "";

  return String.raw`#!/usr/bin/env bash
# pre-commit: block protected-branch commits, sensitive files, and leaked secrets.
set -euo pipefail

branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
git_dir="$(git rev-parse --git-dir 2>/dev/null || echo .git)"
if [ -z "${D}{ALLOW_PROTECTED_COMMIT:-}" ] && [ ! -f "$git_dir/MERGE_HEAD" ]; then
  case "$branch" in
    ${branchCase})
      echo "pre-commit: direct commits to '$branch' are blocked; commit on a feature branch (override: ALLOW_PROTECTED_COMMIT=1)." >&2
      exit 1
      ;;
  esac
fi

TOKEN_RE='(sk-[A-Za-z0-9_-]{32,}|(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[0-9A-Za-z_-]{35}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)'
ALLOWLIST=".githooks/secret-scan-allowlist"

is_allowlisted() {
  local file="$1" pattern
  [ -f "$ALLOWLIST" ] || return 1
  while IFS= read -r pattern || [ -n "$pattern" ]; do
    case "$pattern" in ''|'#'*) continue ;; esac
    # shellcheck disable=SC2254
    case "$file" in $pattern) return 0 ;; esac
  done < "$ALLOWLIST"
  return 1
}

status=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in .githooks/*) continue ;; esac
  if is_allowlisted "$file"; then continue; fi

  base="$(basename "$file" | tr '[:upper:]' '[:lower:]')"
  case "$base" in
    .env.example|.env.sample|.env.template) ;;
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|*.jks|*.keystore|*.kdbx|*.sqlite|*.sqlite3|*.db|id_rsa*|id_ed25519*|id_ecdsa*|id_dsa*|.git-credentials|.netrc|.pypirc|.pgpass)
      echo "pre-commit: sensitive file staged: $file" >&2
      status=1
      continue
      ;;
  esac

  if grep -Eq '^(.*[-_.])?(auth|credentials?|secrets?|oauth)([-_.].*)?\.(json|ya?ml|toml)$' <<<"$base"; then
    echo "pre-commit: credential config staged: $file" >&2
    status=1
    continue
  fi

  added="$(git diff --cached --unified=0 --diff-filter=ACM -- "$file" | awk '/^\+\+\+ / {next} /^\+/ {print substr($0, 2)}' | grep -v 'secret-scan:ignore' || true)"
  [ -n "$added" ] || continue

  if grep -Eq "$TOKEN_RE" <<<"$added"; then
    echo "pre-commit: possible secret in $file (mark intentional fixtures with 'secret-scan:ignore')." >&2
    status=1
  fi
${homeScan}done < <(git diff --cached --name-only --diff-filter=ACM)

exit "$status"
`;
}

function commitMsgHook(): string {
  return String.raw`#!/usr/bin/env bash
# commit-msg: enforce Conventional Commits and owner-only authorship.
set -euo pipefail

msg_file="${D}{1:?usage: commit-msg <message-file>}"
body="$(awk '/^# -+ >8 -+$/ {exit} !/^#/ {print}' "$msg_file")"
subject="$(awk 'NF {print; exit}' <<<"$body")"

if [ -z "$subject" ]; then
  echo "commit-msg: empty commit subject." >&2
  exit 1
fi

if grep -Eq '^(Merge |Revert "|fixup! |squash! |amend! )' <<<"$subject"; then
  exit 0
fi

if [ "${D}{#subject}" -gt 72 ]; then
  echo "commit-msg: subject is ${D}{#subject} characters; keep it at 72 or fewer." >&2
  exit 1
fi

if ! grep -Eq '^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)(\([a-zA-Z0-9._/#-]+\))?!?: [^ ].*$' <<<"$subject"; then
  echo "commit-msg: use Conventional Commits, e.g. 'feat(api): add rate limiting'." >&2
  exit 1
fi

if grep -Eiq '^co-authored-by:.*(claude|anthropic|openai|chatgpt|codex|gemini|copilot|cursor|antigravity|devin|aider)' <<<"$body"; then
  echo "commit-msg: commits are authored by the repo owner; remove AI co-author trailers." >&2
  exit 1
fi

if grep -Eiq '(generated (with|by) (claude|chatgpt|copilot|cursor|gemini|codex|antigravity)|🤖)' <<<"$body"; then
  echo "commit-msg: remove AI generator watermark lines." >&2
  exit 1
fi
`;
}

function installHooksScript(): string {
  return String.raw`#!/usr/bin/env bash
# Activate the versioned hooks in .githooks/ for this clone (idempotent).
set -euo pipefail

root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$root" ]; then
  echo "install-hooks: run this inside a git repository." >&2
  exit 1
fi
if [ ! -d "$root/.githooks" ]; then
  echo "install-hooks: no .githooks/ directory found." >&2
  exit 1
fi

for hook in "$root"/.githooks/*; do
  [ -f "$hook" ] || continue
  case "$(basename "$hook")" in
    *-allowlist|*.md) ;;
    *) chmod +x "$hook" ;;
  esac
done

git -C "$root" config core.hooksPath .githooks
echo "install-hooks: core.hooksPath=.githooks"
`;
}

function secretScanAllowlist(): string {
  return `# Repo-relative paths (shell globs) exempt from the pre-commit secret scan.
# List files that intentionally contain secret-detection patterns or synthetic fixtures.
# Example:
# tests/fixtures/fake-credentials.json
`;
}

function verifyScript(): string {
  return String.raw`#!/usr/bin/env bash
# Done gate: run every check this repo defines (lint, typecheck, test, build).
set -euo pipefail
cd "$(dirname "$0")/.."

ran=0
run() {
  echo "==> $*"
  "$@"
  ran=1
}

has_script() {
  grep -Eq "\"$1\"[[:space:]]*:" package.json
}

if [ -f package.json ]; then
  if [ -f bun.lock ] || [ -f bun.lockb ]; then pm="bun"
  elif [ -f pnpm-lock.yaml ]; then pm="pnpm"
  elif [ -f yarn.lock ]; then pm="yarn"
  else pm="npm"
  fi
  for script in lint typecheck test build; do
    if has_script "$script"; then run "$pm" run "$script"; fi
  done
fi

if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  if command -v pytest >/dev/null 2>&1; then run pytest -q; fi
fi

if [ -f go.mod ]; then
  run go vet ./...
  run go test ./...
fi

if [ -f Cargo.toml ]; then
  run cargo test
fi

if [ "$ran" -eq 0 ]; then
  echo "verify: no checks detected; add this repo's test/build commands to scripts/verify.sh." >&2
  exit 1
fi
echo "verify: all checks passed."
`;
}

function syncSkillsScript(): string {
  return String.raw`#!/usr/bin/env bash
# Mirror canonical skills/<name>.md into .agents/skills/<name>/SKILL.md for agent auto-discovery.
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
dest_root="${D}{AGENT_SKILLS:-$repo_root/.agents/skills}"

synced=0
for src in "$script_dir"/*.md; do
  [ -f "$src" ] || continue
  name="$(basename "$src" .md)"
  mkdir -p "$dest_root/$name"
  cp "$src" "$dest_root/$name/SKILL.md"
  echo "synced $name"
  synced=$((synced + 1))
done

echo "$synced skill(s) synced."
`;
}

// ---------------------------------------------------------------------------
// Human docs
// ---------------------------------------------------------------------------

function readmeMd(c: Ctx): string {
  if (c.scope === "lite") {
    return `# ${c.project}

> One sentence: what this does and who it is for.

## Quickstart

\`\`\`bash
# install
# run
\`\`\`

## Usage

Show the main command or entry point with one real example.

## Notes

- Stack: ${c.stack}
- Working with coding agents? They read [\`AGENTS.md\`](AGENTS.md).
`;
  }

  const devRows = [
    "| Task | Command |",
    "|------|---------|",
    "| Run every check (lint, typecheck, test, build) | `bash scripts/verify.sh` |",
  ];
  if (c.hooks !== "none") {
    devRows.push("| Activate git hooks (once per clone) | `bash scripts/install-hooks.sh` |");
  }
  devRows.push("| Sync repo skills for coding agents | `bash skills/sync-skills.sh` |");

  const sections = [
    `# ${c.project}

> One-sentence pitch: what it does and why it exists.

## Features

- Key capability one
- Key capability two

## Quickstart

\`\`\`bash
git clone <repo-url> && cd ${c.project}
# install dependencies
# cp .env.example .env   (if the app needs configuration)
# run the app
\`\`\`

## Development

${devRows.join("\n")}

## Project layout

\`\`\`text
src/       application code
tests/     automated tests
docs/      design notes and decisions
scripts/   developer tooling
\`\`\`

## Contributing

Branch from \`${c.defaultBranch}\`, write Conventional Commits, and open a PR using the template. Ideas and bugs go through the GitHub issue templates. Coding agents follow [\`AGENTS.md\`](AGENTS.md).`,
  ];

  if (c.scope === "full") {
    sections.push(`## Security

Report vulnerabilities privately as described in [\`SECURITY.md\`](SECURITY.md).

## Releases

${usesDevFlow(c) ? `Finished work lands on \`${c.defaultBranch}\`; a release is one reviewed PR from \`${c.defaultBranch}\` to \`main\`.` : "Every merge to `main` is releasable; tag releases with semantic versions."}`);
  }

  sections.push(`## Stack

${c.stack}
`);
  return sections.join("\n\n");
}

function securityMd(c: Ctx): string {
  return `# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub Security Advisories (**Security → Report a vulnerability**). Please keep details out of public issues until a fix ships.

## Supported versions

The latest release on \`main\` receives security fixes.

## Practices

- Secrets live outside the repository; \`.env.example\` documents configuration.
- Dependencies are pinned by the lockfile and reviewed on upgrade.
${c.hooks !== "none" ? "- Pre-commit hooks scan staged changes for credentials (`bash scripts/install-hooks.sh`).\n" : ""}- CI runs the full verification gate on every pull request.
`;
}

// ---------------------------------------------------------------------------
// Agent docs (written per `writing-for-agents`: pointers, positive rules, done gates)
// ---------------------------------------------------------------------------

function guardrailLines(c: Ctx): string[] {
  if (c.hooks === "none") return [];
  const covers = c.hooks === "full" ? "secrets, protected branches, and commit messages" : "secrets and protected branches";
  return [
    "",
    "## Guardrails",
    "",
    `- Activate hooks once per clone with \`bash scripts/install-hooks.sh\`; they guard ${covers}.`,
    "- When a hook rejects a commit, fix the cause and commit again. Mark intentional secret-like fixtures with `secret-scan:ignore` on the line, or list the path in `.githooks/secret-scan-allowlist`.",
  ];
}

function agentsMd(c: Ctx): string {
  if (c.scope === "lite") {
    return [
      `# AGENTS.md — ${c.project}`,
      "",
      "Operating manual for coding agents. Humans start at [`README.md`](README.md).",
      "",
      `- **Stack**: ${c.stack}`,
      "- **Language**: English for code, identifiers, comments, commits, and docs.",
      `- **Branches**: work on \`feat/<slug>\` or \`fix/<slug>\` and merge into \`${c.defaultBranch}\` when done.`,
      "- **Commits**: Conventional Commits (`type(scope): summary`, 72 chars max), staged by explicit path, authored by the repo owner.",
      "- **Planning**: for anything beyond a small fix, run the `grilling` skill until the design is settled.",
      "- **Done gate**: the README quickstart still works and existing tests pass.",
      "- **Secrets**: keep them in an untracked `.env`; list variable names in `.env.example`.",
      ...guardrailLines(c),
      "",
    ].join("\n");
  }

  const branchLine = usesDevFlow(c)
    ? `- **Branches**: \`main\` holds releases, \`${c.defaultBranch}\` integrates finished work; feature branches merge into \`${c.defaultBranch}\` through PRs.`
    : "- **Branches**: short-lived `feat/*`, `fix/*`, `chore/*`, `docs/*` branches merge into `main` through PRs.";

  return [
    `# AGENTS.md — ${c.project}`,
    "",
    "Operating manual for coding agents in this repository. Humans start at [`README.md`](README.md).",
    "",
    "## Project",
    "",
    `- **Stack**: ${c.stack}`,
    branchLine,
    "- **Done gate**: `bash scripts/verify.sh` exits 0. A task is finished only when it does.",
    "",
    "## Working agreement",
    "",
    "- Write in English everywhere: code, identifiers, comments, commits, PRs, docs, and skills.",
    "- Plan before building anything beyond a small fix: run the `grilling` skill until the design tree is settled, then `to-spec` and `to-tickets`. Use `grill-with-docs` when new domain terms or decisions appear.",
    "- Ship **work units**: one behavior per commit, with its tests and docs in the same commit.",
    "- Stage by explicit path (`git add -- <paths>`) and commit under the repo owner's git identity.",
    "- Reuse the repo templates (`.github/`, `AGENTS/`, `docs/`) and edit them in place when they drift.",
    "",
    "## Rules by topic",
    "",
    "Read the matching file before acting on that topic:",
    "",
    "- **Commits**: writing, splitting, or amending a commit → [`AGENTS/commits.md`](AGENTS/commits.md)",
    "- **Branching**: creating a branch, opening, merging, or releasing a PR → [`AGENTS/branching.md`](AGENTS/branching.md)",
    "- **Security**: touching auth, secrets, env, permissions, input parsing, or dependencies → [`AGENTS/security.md`](AGENTS/security.md)",
    "- **Testing**: adding behavior or fixing a bug → [`AGENTS/tdd.md`](AGENTS/tdd.md)",
    "- **Docs**: changing user-visible behavior, architecture, or these rules → [`AGENTS/docs.md`](AGENTS/docs.md)",
    "",
    "## Agent skills",
    "",
    "- **Issues**: filing, triaging, or slicing work → [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)",
    "- **Domain language**: naming a concept or recording a decision → [`docs/agents/domain.md`](docs/agents/domain.md)",
    "- **Repo skills**: canonical in `skills/<name>.md`, mirrored to `.agents/skills/<name>/SKILL.md` by `bash skills/sync-skills.sh`.",
    ...guardrailLines(c),
    "",
  ].join("\n");
}

function commitsMd(c: Ctx): string {
  return `# Commits

Format: [Conventional Commits](https://www.conventionalcommits.org/)${c.hooks === "full" ? ", enforced by `.githooks/commit-msg`" : ""}.

\`\`\`text
<type>(<scope>): <imperative summary, 72 chars max>

<body: what changed and why>

Closes #<issue>
\`\`\`

| Type | Use for |
|------|---------|
| \`feat\` | new behavior |
| \`fix\` | bug fix |
| \`refactor\` | restructuring without behavior change |
| \`test\` | tests only |
| \`docs\` | docs only |
| \`perf\` | performance |
| \`chore\` / \`build\` / \`ci\` | tooling, dependencies, pipelines |

- Commit one **work unit** at a time: a behavior plus its tests and docs, so each commit builds and reverts cleanly.
- Stage by explicit path: \`git add -- <paths>\`.
- Author every commit as the repo owner (\`git config user.name\` / \`user.email\`); trailers credit humans only.
- Mark breaking changes with \`!\` after the type plus a \`BREAKING CHANGE:\` footer.
`;
}

function branchingMd(c: Ctx): string {
  if (!usesDevFlow(c)) {
    return `# Branching

\`\`\`text
feat/* | fix/* | chore/* | docs/*  ──PR──▶  main
\`\`\`

- \`main\` is always releasable and changes only through PRs.
- Branch from fresh \`main\`: \`git switch main && git pull && git switch -c feat/<issue>-<slug>\`.
- Open the PR with \`.github/PULL_REQUEST_TEMPLATE.md\` filled in and \`Closes #N\`.
- Merge once \`bash scripts/verify.sh\` is green.
- Protect \`main\` on GitHub: require PRs and passing checks.
`;
  }

  const b = c.defaultBranch;
  return `# Branching

\`\`\`text
feat/* | fix/* | chore/* | docs/*  ──PR──▶  ${b}  ──release PR──▶  main
\`\`\`

- \`main\` holds released code; \`${b}\` integrates finished work. Both change only through PRs.
- Branch from fresh \`${b}\`: \`git switch ${b} && git pull && git switch -c feat/<issue>-<slug>\`.
- Open the PR into \`${b}\` with \`.github/PULL_REQUEST_TEMPLATE.md\` filled in and \`Closes #N\`.
- Merge with a merge commit once \`bash scripts/verify.sh\` is green.
- Release with one PR \`${b} → main\`; a human approves and merges it, so \`${b}\` and \`main\` never diverge.
- Protect \`main\` and \`${b}\` on GitHub: require PRs and passing checks.
`;
}

function securityRulesMd(c: Ctx): string {
  const lines = [
    "# Security",
    "",
    "- Keep secrets in untracked `.env` files or a secret manager; commit only `.env.example` with variable names and safe placeholders.",
    "- Fail closed: deny by default on auth, permissions, path handling, and input parsing.",
    "- Validate external input at the boundary (HTTP, CLI args, files, env).",
    "- Add dependencies deliberately: maintained, widely used packages, pinned by the lockfile, with lockfile diffs reviewed.",
    "- Scrub tokens, emails, and absolute host paths from logs, fixtures, docs, and commit messages.",
    "- Security-sensitive change (auth, crypto, permissions, secrets, dependency upgrades) → request a dedicated security review in the PR.",
  ];
  if (c.hooks !== "none") {
    lines.push("- Mark intentional secret-like test fixtures with `secret-scan:ignore` on the same line.");
  }
  if (c.scope === "full") {
    lines.push("- Vulnerability reports follow [`SECURITY.md`](../SECURITY.md).");
  }
  return `${lines.join("\n")}\n`;
}

function tddMd(): string {
  return `# Testing

Loop: **red → green → refactor → commit**.

- New behavior: write the failing test first, watch it go red, then implement until green.
- Bug fix: reproduce it as a failing regression test before touching the code.
- Test behavior through public interfaces; keep mocks at system boundaries (network, clock, filesystem).
- Done gate: \`bash scripts/verify.sh\` exits 0 with no skipped or focused tests left behind.
`;
}

function docsMd(): string {
  return `# Documentation

- \`README.md\` serves humans: purpose, quickstart, development commands. Keep it scannable.
- \`AGENTS.md\` serves agents: conventions, pointers, done gates. Edit it with the \`writing-for-agents\` skill and keep each rule in exactly one place.
- Tool entry files (\`CLAUDE.md\`) import \`AGENTS.md\` instead of restating it.
- Record architecture decisions in \`docs/adr/\` and domain terms in \`GLOSSARY.md\` (see \`docs/agents/domain.md\`).
- Update docs in the same commit as the behavior they describe.
- Write all docs in English.
`;
}

function issueTrackerMd(): string {
  return `# Issue tracker

Work is tracked in **GitHub Issues** for this repository (CLI: \`gh\`).

- File work with the templates in \`.github/ISSUE_TEMPLATE/\`; titles follow Conventional Commit style (\`feat(scope): …\`).
- Labels: one type label (\`bug\`, \`enhancement\`, \`documentation\`, \`refactor\`, \`chore\`) plus optional qualifiers (\`security\`, \`good first issue\`).
- Ideas start as an **Idea** issue, get stress-tested with the \`grilling\` skill, then become tickets with \`to-tickets\`.
- Branch names reference the issue (\`feat/12-login-rate-limit\`); PR bodies close it (\`Closes #12\`).
`;
}

function domainMd(): string {
  return `# Domain docs

- **Glossary**: \`GLOSSARY.md\` at the repo root defines the ubiquitous language. Use its terms verbatim in code, issues, and docs; add a term the moment a concept gets a name.
- **Decisions**: \`docs/adr/NNNN-<slug>.md\`, one decision per file (Context, Decision, Consequences). Supersede accepted ADRs with a new one rather than editing them.
- Both are created lazily: the first \`grill-with-docs\` or \`domain-modeling\` session that names a term or settles a decision writes them.
`;
}

function glossaryMd(c: Ctx): string {
  return `# Glossary

Ubiquitous language for ${c.project}. Code, issues, and docs use these words verbatim.

| Term | Meaning | Not to be confused with |
|------|---------|-------------------------|
| _Example_ | _Replace with the first real domain term._ | |
`;
}

function adrMd(): string {
  return `# 1. Record architecture decisions

- **Status**: Accepted
- **Date**: <YYYY-MM-DD>

## Context

Decisions get lost in chat logs and agent sessions. Future contributors, human or agent, need the reasoning behind the structure, not just the result.

## Decision

Record each significant architecture decision as a numbered ADR in \`docs/adr/\` with Context, Decision, and Consequences sections.

## Consequences

- Agents read \`docs/adr/\` before proposing structural changes.
- Reversing a decision means writing a new ADR that supersedes the old one.
`;
}

function agentsSkillsReadme(): string {
  return `# Repo-local skills

Canonical skills live in \`skills/<name>.md\`. \`bash skills/sync-skills.sh\` mirrors each one to \`.agents/skills/<name>/SKILL.md\`, where Antigravity, T3 Code, Codex, OpenCode, Claude Code, and Cursor discover them automatically. Edit the canonical file, then re-sync.
`;
}

// ---------------------------------------------------------------------------
// GitHub templates & config files
// ---------------------------------------------------------------------------

function prTemplate(c: Ctx): string {
  const checks = [
    "- [ ] `bash scripts/verify.sh` passes",
    "- [ ] Tests cover the new behavior or the fixed bug",
    "- [ ] Docs updated (README / AGENTS.md / ADR) where behavior changed",
    "- [ ] No secrets, tokens, or local paths in the diff",
    "- [ ] Breaking changes called out (or none)",
  ];
  if (c.scope === "full") {
    checks.push("- [ ] Security review requested if auth, secrets, permissions, or dependencies changed");
  }
  return `## Summary

<!-- What changed and why, in one or two sentences. -->

## Issue

Closes #

## Changes

- 

## How to test

1. 

## Checklist

${checks.join("\n")}
`;
}

function bugTemplate(): string {
  return `---
name: Bug report
about: Something behaves differently than expected
title: "fix(<scope>): <short description>"
labels: ["bug"]
---

## What happened

## Steps to reproduce

1. 

## Expected behavior

## Environment

- Version / commit:
- OS / runtime:
`;
}

function enhancementTemplate(): string {
  return `---
name: Enhancement
about: A concrete feature or improvement ready to be built
title: "feat(<scope>): <short description>"
labels: ["enhancement"]
---

## Problem

## Proposed solution

## Acceptance criteria

- [ ] 
- [ ] Tests cover the new behavior
- [ ] Docs updated
`;
}

function ideaTemplate(): string {
  return `---
name: Idea / design discussion
about: A rough idea to stress-test before it becomes work
title: "idea: <short description>"
labels: ["enhancement", "needs-design"]
---

## The idea

## Who it is for and why now

## Options considered

## Open questions

<!-- Before building: run the grilling skill on this issue, then turn the settled design into tickets with to-tickets. -->
`;
}

function issueConfigYml(): string {
  return `blank_issues_enabled: false
`;
}

function ciSetupSteps(stack: string): string[] {
  const steps: string[] = [];
  const hasBun = /\bbun\b/i.test(stack);
  if (hasBun) {
    steps.push("      - uses: oven-sh/setup-bun@v2", "      - run: bun install --frozen-lockfile");
  } else if (/\b(node(\.js)?|npm|pnpm|yarn|typescript|javascript|react|next(\.js)?|vite)\b/i.test(stack)) {
    steps.push(
      "      - uses: actions/setup-node@v4",
      "        with:",
      "          node-version: lts/*",
      "      - run: npm ci",
    );
  }
  if (/\b(python|django|flask|fastapi)\b/i.test(stack)) {
    steps.push(
      "      - uses: actions/setup-python@v5",
      "        with:",
      '          python-version: "3.x"',
      "      - run: |",
      "          python -m pip install --upgrade pip pytest",
      "          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi",
    );
  }
  if (/\bgo(lang)?\b/i.test(stack)) {
    steps.push("      - uses: actions/setup-go@v5", "        with:", "          go-version-file: go.mod");
  }
  if (/\b(rust|cargo)\b/i.test(stack)) {
    steps.push("      - uses: dtolnay/rust-toolchain@stable");
  }
  if (steps.length === 0) {
    steps.push("      # Add this repo's toolchain setup here (e.g. actions/setup-node, oven-sh/setup-bun).");
  }
  return steps;
}

function ciWorkflow(c: Ctx): string {
  const branches = Array.from(new Set(["main", c.defaultBranch])).join(", ");
  return [
    "name: CI",
    "",
    "on:",
    "  push:",
    `    branches: [${branches}]`,
    "  pull_request:",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  verify:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    ...ciSetupSteps(c.stack),
    "      - name: Verify",
    "        run: bash scripts/verify.sh",
    "",
  ].join("\n");
}

function gitignore(): string {
  return `# Dependencies & build output
node_modules/
dist/
build/
coverage/
target/
__pycache__/
*.log

# Secrets & local state
.env
.env.*
!.env.example
*.db
*.db-journal
*.db-wal
*.db-shm
*.sqlite
*.sqlite3

# OS & editors
.DS_Store
.idea/
*.swp
`;
}

function editorconfig(): string {
  return `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[*.{py,rs}]
indent_size = 4

[{*.go,Makefile}]
indent_style = tab
`;
}

// ---------------------------------------------------------------------------
// Blueprint assembly
// ---------------------------------------------------------------------------

/**
 * Builds the canonical personal-repo standards blueprint for a scope tier.
 * Hooks scale with the tier (`lite` → none, `standard` → light, `full` → full) unless overridden.
 */
export function buildRepoStandardsBlueprint(
  options: RepoStandardsOptions = {},
): RepoStandardsBlueprint {
  const scope: RepoScope = REPO_SCOPES.includes(options.scope as RepoScope)
    ? (options.scope as RepoScope)
    : "standard";
  const c: Ctx = {
    project: sanitizeProject(options.project),
    stack: sanitizeStack(options.stack),
    defaultBranch: sanitizeBranch(options.defaultBranch, scope === "lite" ? "main" : "dev"),
    scope,
    hooks: resolveHookLevel(scope, options.hooks),
  };

  const files: RepoStandardFile[] = [
    { path: "README.md", purpose: "Human-facing overview and quickstart", content: readmeMd(c) },
    { path: "AGENTS.md", purpose: "Agent operating manual and rule pointers", content: agentsMd(c) },
    { path: "CLAUDE.md", purpose: "Claude Code entry point importing AGENTS.md", content: "@AGENTS.md\n" },
    { path: ".gitignore", purpose: "Ignores secrets, local databases, dependencies, and build output", content: gitignore() },
  ];

  if (scope !== "lite") {
    files.push(
      { path: ".editorconfig", purpose: "Consistent encoding, line endings, and indentation across editors and agents", content: editorconfig() },
      { path: "AGENTS/commits.md", purpose: "Conventional Commits and work-unit rules", content: commitsMd(c) },
      { path: "AGENTS/branching.md", purpose: "Branch, PR, merge, and release flow", content: branchingMd(c) },
      { path: "AGENTS/security.md", purpose: "Secret hygiene and fail-closed rules", content: securityRulesMd(c) },
      { path: "AGENTS/tdd.md", purpose: "Red/green/refactor testing policy", content: tddMd() },
      { path: "AGENTS/docs.md", purpose: "README vs AGENTS.md split and doc rules", content: docsMd() },
      { path: "docs/agents/issue-tracker.md", purpose: "Where and how work is tracked", content: issueTrackerMd() },
      { path: "docs/agents/domain.md", purpose: "Glossary and ADR conventions", content: domainMd() },
      { path: ".github/PULL_REQUEST_TEMPLATE.md", purpose: "Standard PR description and checklist", content: prTemplate(c) },
      { path: ".github/ISSUE_TEMPLATE/bug_report.md", purpose: "Bug report template", content: bugTemplate() },
      { path: ".github/ISSUE_TEMPLATE/enhancement.md", purpose: "Buildable feature template", content: enhancementTemplate() },
      { path: ".github/ISSUE_TEMPLATE/idea.md", purpose: "Idea template that routes through grilling before tickets", content: ideaTemplate() },
      { path: "scripts/verify.sh", executable: true, purpose: "Done gate running every detected check", content: verifyScript() },
      { path: "skills/sync-skills.sh", executable: true, purpose: "Mirrors skills/*.md to .agents/skills/<name>/SKILL.md", content: syncSkillsScript() },
      { path: ".agents/skills/README.md", purpose: "Repo-local skill discovery convention", content: agentsSkillsReadme() },
    );
  }

  if (scope === "full") {
    files.push(
      { path: "SECURITY.md", purpose: "Vulnerability reporting policy", content: securityMd(c) },
      { path: ".github/ISSUE_TEMPLATE/config.yml", purpose: "Forces issues through the templates", content: issueConfigYml() },
      { path: ".github/workflows/ci.yml", purpose: "Runs the verify gate on pushes and PRs", content: ciWorkflow(c) },
      { path: "GLOSSARY.md", purpose: "Ubiquitous language seed", content: glossaryMd(c) },
      { path: "docs/adr/0001-record-architecture-decisions.md", purpose: "First ADR establishing the ADR practice", content: adrMd() },
    );
  }

  if (c.hooks !== "none") {
    files.push(
      { path: ".githooks/pre-commit", executable: true, purpose: c.hooks === "full" ? "Blocks protected-branch commits, sensitive files, secrets, and host paths" : "Blocks protected-branch commits, sensitive files, and secrets", content: preCommitHook(c) },
      { path: ".githooks/secret-scan-allowlist", purpose: "Paths exempt from the secret scan", content: secretScanAllowlist() },
      { path: "scripts/install-hooks.sh", executable: true, purpose: "Activates core.hooksPath=.githooks", content: installHooksScript() },
    );
    if (c.hooks === "full") {
      files.push({ path: ".githooks/commit-msg", executable: true, purpose: "Enforces Conventional Commits and owner-only authorship", content: commitMsgHook() });
    }
  }

  const antiDriftRules = [
    "AGENTS.md is the single source of agent rules; tool entry files such as CLAUDE.md import it with `@AGENTS.md` instead of restating it.",
    "Match the tier to the repo (lite → standard → full) and promote it as the repo grows; keep hooks proportional to the risk.",
    "Edit the shipped templates in place (README, AGENTS, issue/PR templates) rather than inventing parallel ones.",
    "Plan non-trivial features with the `grilling` skill before code, then `to-spec` and `to-tickets`.",
    "English everywhere, Conventional Commits, explicit-path staging, and owner-only authorship.",
  ];
  if (c.hooks !== "none") {
    antiDriftRules.push("Activate hooks with `bash scripts/install-hooks.sh`; when a hook rejects a commit, fix the cause.");
  }

  const complianceChecklist = files.map(
    (f) => `\`${f.path}\` present${f.executable ? " and executable" : ""}, aligned with the blueprint — ${f.purpose}`,
  );
  complianceChecklist.push("No competing agent rule files (`.cursorrules`, duplicated CLAUDE.md content) restating AGENTS.md");
  if (c.hooks !== "none") {
    complianceChecklist.push("`git config --get core.hooksPath` prints `.githooks`");
  }
  if (scope !== "lite") {
    complianceChecklist.push(
      `GitHub branch protection requires PRs on ${usesDevFlow(c) ? `\`main\` and \`${c.defaultBranch}\`` : "`main`"}`,
      "Repo skills in `skills/*.md` are mirrored to `.agents/skills/<name>/SKILL.md`",
    );
  }

  return {
    standardsVersion: REPO_STANDARDS_VERSION,
    scope,
    hooks: c.hooks,
    project: c.project,
    stack: c.stack,
    defaultBranch: c.defaultBranch,
    antiDriftRules,
    complianceChecklist,
    files,
  };
}

function fenceLang(filePath: string): string {
  if (filePath.endsWith(".md")) return "markdown";
  if (filePath.endsWith(".yml") || filePath.endsWith(".yaml")) return "yaml";
  if (filePath.endsWith(".sh") || /^\.githooks\/(pre-commit|commit-msg)$/.test(filePath)) return "bash";
  if (filePath === ".editorconfig") return "ini";
  return "text";
}

/** Renders the blueprint as Markdown for `cardinal_bootstrap_repo`. */
export function renderRepoStandardsMarkdown(bp: RepoStandardsBlueprint): string {
  const lines = [
    `## Personal Repo Standards (v${bp.standardsVersion} — scope: \`${bp.scope}\`, hooks: \`${bp.hooks}\`)`,
    "",
    "Apply to new repos and audit existing ones: create missing files, merge drifted ones, keep project-specific content.",
    "",
    "### Scope guide",
    ...REPO_SCOPES.map((s) => `- **\`${s}\`**${s === bp.scope ? " (selected)" : ""}: ${SCOPE_GUIDE[s]}`),
    "",
    "### Anti-Drift Rules",
    ...bp.antiDriftRules.map((rule) => `- ${rule}`),
    "",
    "### Compliance Checklist",
    ...bp.complianceChecklist.map((item) => `- [ ] ${item}`),
    "",
    "### Canonical Blueprint Files",
  ];

  for (const file of bp.files) {
    const fence = file.content.includes("```") ? "````" : "```";
    lines.push(
      "",
      `#### \`${file.path}\`${file.executable ? " (executable)" : ""}`,
      `_${file.purpose}_`,
      `${fence}${fenceLang(file.path)}`,
      file.content.trimEnd(),
      fence,
    );
  }

  return `${lines.join("\n")}\n`;
}
