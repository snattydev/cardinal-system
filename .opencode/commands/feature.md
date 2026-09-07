---
description: Complete multi-agent feature workflow — plan -> tester (RED) -> builder (GREEN) -> verify -> reviewer -> docs -> commit
---

# /feature — Complete feature workflow

Execute the complete Cardinal System feature workflow:

1. **Analyze** the user request. If unclear, ask for clarification (do not make assumptions).
2. **Read** `AGENTS.md`, the relevant spec in `docs/superpowers/specs/`, and the roadmap in `docs/roadmap/`.
3. **Decompose** into subtasks with dependencies.
4. **@tester** writes tests first (RED) — only for mandatory TDD scopes (auth, keys, ws, db, router).
5. **@builder** implements (GREEN) and refactors if needed.
6. **Verify** by running full `bun test`, and `bun run build` in frontend if frontend was touched.
7. **@reviewer** performs code review on the diff.
8. **@docs** creates `docs/features/<date>-<name>.md`.
9. **Secret leak audit**: `git diff | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'`.
10. **Suggest** the commit message: Conventional Commits, first line in English <=72 chars, body in Spanish. Do NOT commit without user approval — show the diff first.

Rules: small features (1-2 files without critical logic) -> you can execute directly with @builder without the full workflow. Version bumps must only be PATCH on dev.
