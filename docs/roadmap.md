# Cardinal System — Roadmap

> Updated: 2026-09-03. Single source of truth for priorities.

---

## Now: Phase 2 — Cardinal v2 (in progress — v0.2.5)

Phase 1 (Context Store) complete in `dev` since v0.2.0. Phase 2 in progress:
blackboard + MCP hub + router/keys (`/router`, create keys, fusion). See
[`roadmap/fase-2.md`](roadmap/fase-2.md). Sprint:
[`sprints/2026-09-03-router-surface.md`](sprints/2026-09-03-router-surface.md).

Pending stabilization: PR `dev → main` when freeze is decided (Phase 1 + 2
partial accumulated in `dev`).

---

## Phases

| Phase | Name | Status | Roadmap |
|-------|------|--------|---------|
| 0 | Living Skeleton | Complete | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | Complete (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cardinal v2 (Blackboard + MCP + Pool) | In progress | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 3 | Knowledge Graph | Future | — |
| 4 | Automations | Future | — |

### Phase 2 — state (2026-09-03)

| Pillar | Done | Pending |
|--------|------|---------|
| 3 Blackboard | tasks CRUD, WS, mailbox API, UI `/tasks`, MCP board tools, mailbox MCP | — |
| 1 MCP hub | `packages/mcp` memory + board + mailbox, compose `:8789` | — |
| 2 Pool/router | router, key factory, `/keys` create+expiry+USD, dashboard `/router`, fusion/MoA | spike-003 opencode-go (optional); e2e zen free (#5); UI mutate chains / show Fusion |

Thesis: orchestration is commodity; Cardinal is the brain (identity + context +
blackboard); herdr/Hermes/CLIs are the hands.

---

## Arsenal

> Owner-only info (which CLIs and models are paid for and until when). Moved to `README.md` so it does not live in the repo.

## Conventions

- **Versioning:** `MAJOR.FASE.PATCH` (source: `package.json`)
- **Commits:** Conventional Commits (English ≤72 chars, Spanish body)
- **Branches:** `feature/* → dev → main` (merge commit)
- **TDD:** Required for core. Not for frontend/docs
- **Agents:** Names outside the repo. Roles only
- **Context:** `context/` → knowledge base. `AGENTS.md` → dev rules

---

*Updated when priorities change or a phase completes.*
