---
name: cardinal-standards
description: Personal repo standards. Use when scaffolding a new repo, auditing or retrofitting an existing one, or adding README, AGENTS.md, git hooks, GitHub templates, or repo skills.
category: development
---

# Personal Repo Standards

Every personal repo follows one blueprint, served by the Cardinal MCP tool `cardinal_bootstrap_repo`. Pull it from there rather than writing templates from memory.

## Steps

1. **Pick the tier** from the repo's size and risk:
   - `lite`: scripts, spikes, dotfiles, small tools. README + AGENTS.md + .gitignore, no hooks.
   - `standard` (default): real apps and libraries. Modular `AGENTS/`, GitHub templates, `scripts/verify.sh`, repo skills, light hook.
   - `full`: multi-module, security-sensitive, long-lived. Adds SECURITY.md, CI, GLOSSARY.md, ADRs, full hooks.
   Done when the tier is named with a one-sentence reason.
2. **Fetch the blueprint**: `cardinal_bootstrap_repo` with `preset: "standards"`, `scope`, `project`, `stack`, `format: "json"`.
3. **Apply or audit** every entry in `files[]`:
   - Missing → create it, replacing placeholders with real project facts.
   - Present → merge the blueprint's rules in and keep project-specific content.
   - `CLAUDE.md` holds `@AGENTS.md`; AGENTS.md edits follow the `writing-for-agents` skill.
   Done when every `complianceChecklist` item is satisfied or waived with a written reason.
4. **Activate**: `bash scripts/install-hooks.sh` when hooks ship; `bash skills/sync-skills.sh` when `skills/` exists.
5. **Verify and commit**: `bash scripts/verify.sh` exits 0 (standard/full), then commit as one work unit, e.g. `chore(repo): adopt personal repo standards`.

## Brainstorming features

`preset: "brainstorm"` loads `grilling`, `grill-with-docs`, `domain-modeling`, `to-spec`, and `to-tickets` with no starter files. Settle the design tree before code.

## In this repo

Cardinal runs the `full`-tier hooks. `.githooks/` and `scripts/install-hooks.sh` are generated from `packages/mcp/src/repo-standards.ts` by `bun run standards:sync`, and a parity test fails if they drift. Activate them with `bun run hooks:install`.
