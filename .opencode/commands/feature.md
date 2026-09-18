---
description: Complete multi-agent feature workflow — plan -> tester (RED) -> builder (GREEN) -> verify -> reviewer -> docs -> commit
---

# /feature — Complete feature workflow

Execute the complete Cardinal System feature workflow:

1. **Analyze** the user request. If unclear, ask for clarification (do not make assumptions).
2. **Read** `AGENTS.md`, the relevant spec in `docs/superpowers/specs/`, and the roadmap in `docs/roadmap/`.
3. **GitHub Issue** if none exists. Branch `feature/#N-<desc>` (or `fix`/`chore`/`docs`) from `dev`. PR target is `dev` (`AGENTS/branching.md`).
4. **Decompose** into subtasks with dependencies.
5. **@tester** writes tests first (RED) — only for mandatory TDD scopes (auth, keys, ws, db, router).
6. **@builder** implements (GREEN) and refactors if needed.
7. **Verify** by running full `bun test`, and `bun run build` in frontend if frontend was touched.
8. **@reviewer** performs code review on the diff.
9. **@docs** creates `docs/features/<date>-<name>.md`.
10. **Secret leak audit**: `git diff --cached | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'`.
11. **Suggest** the commit message: Conventional Commits, first line in English <=72 chars, body in English. Open a PR to `dev`. Do NOT commit without user approval — show the diff first.

Rules: small features (1-2 files without critical logic) -> you can execute directly with @builder without the full workflow. Version bumps must only be PATCH on `dev`. No Spanish in commits, PRs, or docs.
