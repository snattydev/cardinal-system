# Cardinal System — Roadmap

> Updated: 2026-09-07. Single source of truth for priorities.

---

## Now: Phase 2 — Cardinal v2 (closing — v0.2.5)

Phase 1 (Context Store) complete in `dev` since v0.2.0. Phase 2 closing:
blackboard + MCP hub + router/keys (`/router`, create keys, fusion) all
green in `dev`. See [`roadmap/fase-2.md`](roadmap/fase-2.md). Sprint:
[`sprints/2026-09-03-router-surface.md`](sprints/2026-09-03-router-surface.md).

Next batch is v3 (post-router), unblocked now that the router closed:
containerized agentic backend, tasks v2 (assignment triggers one-shot),
scoped `/memory` module, chatbot, design system, notifications.
Backlog: [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md).

Pending stabilization: PR `dev → main` (item 10 of v2 backlog) before
sprint N1.

---

## Phases

| Phase | Name | Status | Roadmap |
|-------|------|--------|---------|
| 0 | Living Skeleton | Complete | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | Complete (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cardinal v2 (Blackboard + MCP + Pool) | Closing (v0.2.5) | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 2.5 | Cardinal v3 (Containerized workers + UI + Memory) | Planning | [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md) |
| 3 | Knowledge Graph | Future | — |
| 4 | Automations | Future | — |

### Phase 2 — state (2026-09-07)

| Pillar | Done | Pending |
|--------|------|---------|
| 3 Blackboard | tasks CRUD, WS, mailbox API, UI `/tasks`, MCP board tools, mailbox MCP | tasks v2 (assignment triggers, N2) |
| 1 MCP hub | `packages/mcp` memory + board + mailbox, compose `:8789` | scoped `/memory` module (N3) |
| 2 Pool/router | router, key factory, `/keys` create+expiry+USD, dashboard `/router`, fusion/MoA | spike-003 opencode-go (optional); e2e zen free (#5); UI mutate chains / show Fusion |
| 5 Worker pool | — | N1: containerized agentic backend |

Thesis: orchestration is commodity; Cardinal is the brain (identity + context +
blackboard); herdr/Hermes/CLIs are the hands.

---

## Conventions

- **Versioning:** `MAJOR.FASE.PATCH` (source: `package.json`)
- **Language:** English only (docs, skills, comments, commits, PRs) — `AGENTS/docs.md`
- **Commits:** Conventional Commits (English ≤72 chars, English body)
- **Branches:** `feature/* → dev → main` (merge commit)
- **TDD:** Required for core. Not for frontend/docs
- **Agents:** Names outside the repo. Roles only
- **Context:** `context/` → knowledge base. `AGENTS.md` → dev rules

---

*Updated when priorities change or a phase completes.*
