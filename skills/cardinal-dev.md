---
name: cardinal-dev
description: Development workflow for Cardinal System — branching, commits, PRs, versioning, TDD, roles, documentation. Use when working on the repo.
category: development
---

# Cardinal System — Development Workflow

Index of rules. Live rules live in `AGENTS.md` and are delegated to specific skills:

- Commit format → `cardinal-commit`
- Create a PR → `cardinal-pr`

This skill keeps only **repo conventions** that no other file declares.

---

## Branching

```
feature/* ──→ PR ──→ dev ──→ PR ──→ main
fix/*      ──→ PR ──→ dev ──→ PR ──→ main
chore/*    ──→ PR ──→ dev ──→ PR ──→ main
docs/*     ──→ PR ──→ dev ──→ PR ──→ main
```

- Work is done in `feature/*`, `fix/*`, `chore/*`, or `docs/*` from `dev`.
- Each branch is opened as a PR to `dev`. No direct merges to `dev`.
- The merge to `dev` is done by the same agent that implemented the feature, after green.
- When `dev` is stable → a single PR from `dev` to `main` with review.
- `main` never receives direct commits.
- **Merge strategy:** merge commit. No squash. `dev` and `main` never diverge.

---

## Commits

Conventional Commits. Rules and examples: see `cardinal-commit`.

Summary:
- First line ≤ 72 chars, in English.
- Body in Spanish — explain *what* and *why*, not *how*.
- Authorship: the commit uses the name and email of the GitHub user, not the agent's.

---

## Versioning

- Source of truth: `version` in root `package.json`.
- Format: `MAJOR.FASE.PATCH`.
  - **MAJOR**: `0` until stable → `1.0.0`.
  - **FASE**: roadmap phase. Bumped only in the PR `dev → main`.
  - **PATCH**: incremental per feature/fix/chore within the phase.

---

## TDD — when is it mandatory

| Scope | TDD mandatory | Verification |
|-------|---------------|--------------|
| Auth, keys, ws, db, router | Yes (RED → GREEN → REFACTOR → COMMIT) | `bun test` |
| Frontend components | No | `bun run build` |
| CSS / styles | No | Visual review |
| Docs, configs, deploy | No | Human review |

---

## Review roles

Reviewers are **roles**, not fixed identities. Specific names are assigned outside the repo.

| Role | Trigger | Scope |
|------|---------|-------|
| Standard Review | Every PR to `main` | Code, clarity, maintainability, tests |
| Security Review | Changes in `auth/`, `keys/`, `ws/`, protocol | Secrets, injection, architecture |
| Pentest | One-shot, on demand | Recon, vulnerabilities, PoC |

Templates: `docs/agents/prompts/standard-review.md` and `docs/agents/prompts/security-review-checklist.md`.

---

## Per-feature documentation

- Each significant feature, fix, or patch must have a doc at `docs/features/<date>-<name>.md`.
- Include: what was done, why, decisions, alternatives, files created/modified.
- The PR template is only a summary. The detail lives in the feature doc.
- Do not document version bumps or trivial one-line changes.

### Feature workflow

1. **Delegate** — subagent(s) implement.
2. **Verify** — `bun test`, `bun run build`, review if applicable.
3. **Document** — `docs/features/<date>-<name>.md`.
4. **Commit + push** — conventional commit to `dev` including the doc.

---

## Security

- Audit leaks before push: keys, tokens, absolute paths, emails.
- `.env` and secrets **never committed** — use `.env.example` as template.
- API keys: format `sk-cardinal-*`, SHA-256 in DB.
- Nothing exposed without auth layer.

---

## Stack

- Backend: TypeScript + Bun (`Bun.serve`, `bun:sqlite`).
- Frontend: React + TypeScript + Vite + Tailwind.
- DB: SQLite.
- Real-time: native WebSocket.
- Runtime: always containerized with Podman.
- Dev: `compose.yaml`. Prod: Podman Quadlet.
