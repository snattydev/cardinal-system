# Cardinal System — Development Rules

> Repo development rules. Just the index. The rules live in `AGENTS/*.md`.

**Project references:**
- [`docs/vision.md`](./docs/vision.md) — goal and principles
- [`docs/stack.md`](./docs/stack.md) — technical stack
- [`docs/security.md`](./docs/security.md) — security model
- [`docs/api.md`](./docs/api.md) — REST, WebSocket, JWT recipe
- [`docs/roadmap.md`](./docs/roadmap.md) — phases and priorities
- [`context/ecosystem.md`](./context/ecosystem.md) — knowledge base

---

## Language

English only: docs, skills, source comments, identifiers, commits, PRs, and agent prompts. Policy: [`AGENTS/docs.md`](./AGENTS/docs.md).

## Stack

- Backend: TypeScript + Bun (`Bun.serve`, `bun:sqlite`).
- Frontend: React + TypeScript + Vite + Tailwind.
- DB: SQLite (single file, zero infra).
- Real-time: native WebSocket (see [`docs/superpowers/specs/`](./docs/superpowers/specs/)).
- Runtime: always containerized with Podman. Do not install native dependencies on the host.

---

## Rules (split by topic)

| Topic | File |
|-------|------|
| Branching and merge strategy | [`AGENTS/branching.md`](./AGENTS/branching.md) |
| Commit format and rules | [`AGENTS/commits.md`](./AGENTS/commits.md) |
| PR flow and pre-merge checklist | [`AGENTS/prs.md`](./AGENTS/prs.md) |
| Issue tracking and Blackboard | [`AGENTS/issues.md`](./AGENTS/issues.md) |
| `MAJOR.FASE.PATCH` versioning | [`AGENTS/versioning.md`](./AGENTS/versioning.md) |
| TDD and what to test | [`AGENTS/tdd.md`](./AGENTS/tdd.md) |
| Quick security rules | [`AGENTS/security.md`](./AGENTS/security.md) |
| Documentation and language (English only) | [`AGENTS/docs.md`](./AGENTS/docs.md) |
| Repo structure | [`AGENTS/structure.md`](./AGENTS/structure.md) |

## Development workflow

- Cursor as daily surface → [`docs/agents/cursor-workflow.md`](./docs/agents/cursor-workflow.md)
- OpenCode as alternative path (legacy) → [`docs/agents/opencode-orchestration.md`](./docs/agents/opencode-orchestration.md)
- Canonical roles → [`docs/agents/roles/`](./docs/agents/roles/)

## Active skills

| Skill | When |
|-------|------|
| `cardinal-dev` | Index of development rules (this file) |
| `cardinal-commit` | Commit format and rules (detail) |
| `cardinal-pr` | Create a PR step by step |
| `cardinal-system` | Runtime, API, operational quirks |

Planned and pending skills: [`docs/skills.md`](./docs/skills.md).

---

## Current state (2026-10-06)

Root `package.json` is **0.2.6** on both `main` and `dev`. There are no git tags and no GitHub Actions workflows. A CHANGELOG, a `v0.2.6` tag, and a PATCH bump on `dev` are proposed in [#47](https://github.com/snattydev/cardinal-system/issues/47). CI is proposed in [#42](https://github.com/snattydev/cardinal-system/issues/42).

| Phase | Status | Spec |
|-------|--------|------|
| Phase 0 — Living Skeleton | Complete | [`docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md) |
| Phase 1 — Context Store | Complete (v0.2.0+) | [`docs/roadmap/fase-1.md`](./docs/roadmap/fase-1.md) · [`docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md) |
| Phase 2 — Cardinal v2 (Blackboard + MCP + Pool) | Complete on `main` (v0.2.6). Freeze PR [#12](https://github.com/snattydev/cardinal-system/pull/12) merged 2026-09-18 (`Closes #16`, `#17`, `#19`) | [`docs/roadmap/fase-2.md`](./docs/roadmap/fase-2.md) · [`docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](./docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md) |
| Phase 2.5 — Cardinal v3 | Started on `dev` only. N1 worker is PR [#36](https://github.com/snattydev/cardinal-system/pull/36), merged 2026-10-05. Tracking [#28](https://github.com/snattydev/cardinal-system/issues/28). [#20](https://github.com/snattydev/cardinal-system/issues/20) stays open: `Closes` applies on the default branch (`main`) | [`docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](./docs/superpowers/plans/2026-09-07-cardinal-v3-backlog.md) |
| Phase 3+ — Graph + Automations | Future | — |

Product code on `dev` that is not on `main`: `packages/worker`, `backend/src/orchestrator`, `deploy/Containerfile.worker` (PR [#36](https://github.com/snattydev/cardinal-system/pull/36)). Priorities and the 2026-10-06 follow-up issues: [`docs/roadmap.md`](./docs/roadmap.md). Recorded decisions: [`context/ecosystem.md`](./context/ecosystem.md). `docs/stack.md` still needs the rewrite in [#46](https://github.com/snattydev/cardinal-system/issues/46).

SDLC lives in GitHub Issues. Runtime coordination lives on the Blackboard. Policy: [`AGENTS/issues.md`](./AGENTS/issues.md).

---

*Live rules. If something changes, update `AGENTS/*.md`.*
