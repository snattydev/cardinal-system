# Cardinal System — Roadmap

> Updated: 2026-09-10. Single source of truth for priorities.

---

## Now: Phase 2 — Cardinal v2 (closing — v0.2.6)

Phase 1 (Context Store) complete in `dev` since v0.2.0. Phase 2 closing:
blackboard + MCP hub + router/keys (`/router`, create keys, fusion) all
green in `dev` (461 tests pass). See [`roadmap/fase-2.md`](roadmap/fase-2.md).

Pending stabilization: PR `dev → main` (item 10 of v2 backlog) before
sprint N1.

Next batch is v3 (post-router), unblocked once PR `dev -> main` lands:
1. **N1:** Lightweight containerized maintenance worker (Bun + MCP, JSON I/O, scoped keys)
2. **N2:** Tasks v2 (assignment triggers N1 worker, auto-fire toggle)
3. **N3:** Memory monolith (`/vaults` Markdown tree with path-level ACL and backup job)
4. **N4:** Cockpit Command (`Ctrl+K`) + Web TUI view to Herdr container (replacing heavy chatbot)
5. **N5:** SAO Design System (Obsidian/Graphite, Aincrad Orange, Sinon Turquoise, Underworld Purple, Slash Red errors, floating panels, audio pack)
6. **N6:** In-app notification center
Backlog: [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md).

---

## Phases

| Phase | Name | Status | Roadmap |
|-------|------|--------|---------|
| 0 | Living Skeleton | Complete | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | Complete (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cardinal v2 (Blackboard + MCP + Pool) | Closing (v0.2.6) | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 2.5 | Cardinal v3 (Maintenance workers + Vaults Memory + SAO Cockpit) | Planning | [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md) |
| 3 | Knowledge Graph | Future | — |
| 4 | Automations | Future | — |

### Phase 2 — state (2026-09-07)

| Pillar | Done | Pending |
|--------|------|---------|
| 3 Blackboard | tasks CRUD, WS, mailbox API, UI `/tasks`, MCP board tools, mailbox MCP | tasks v2 (assignment triggers maintenance worker, N2) |
| 1 MCP hub | `packages/mcp` memory + board + mailbox, compose `:8789` | `/vaults` scoped memory monolith (N3) |
| 2 Pool/router | router, key factory, `/keys` create+expiry+USD, dashboard `/router`, fusion/MoA | UI mutate chains / show Fusion |
| 5 Worker pool | — | N1: lightweight maintenance worker container |

Thesis: Cardinal is the 24/7 SSOT brain (identity + memory vaults + blackboard + router).
Heavy development belongs to persistent agents in Herdr (Kirito, Lisbeth, Agil) and workstation CLIs.
Internal workers handle automated maintenance, summarization, and memory hygiene.

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
