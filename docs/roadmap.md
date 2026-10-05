# Cardinal System — Roadmap

> Updated: 2026-10-05. Single source of truth for priorities.

---

## Now: Phase 2 — Cardinal v2 (closing — v0.2.6)

Phase 1 (Context Store) complete in `dev` since v0.2.0. Phase 2 is complete
in `dev`: blackboard + MCP hub + router/keys + SAO baseline + Playwright
start. See [`roadmap/fase-2.md`](roadmap/fase-2.md).

**Freeze:** PR [`dev → main` #12](https://github.com/snattydev/cardinal-system/pull/12)
closes issues [#16](https://github.com/snattydev/cardinal-system/issues/16)
(release), [#17](https://github.com/snattydev/cardinal-system/issues/17) (N5),
[#19](https://github.com/snattydev/cardinal-system/issues/19) (dual tracking).
Human merges; never auto-merge.

**N1** maintenance worker merged to `dev` (PR [#36](https://github.com/snattydev/cardinal-system/pull/36)).
Feature doc: [`features/2026-10-05-internal-maintenance-worker.md`](features/2026-10-05-internal-maintenance-worker.md).
v3 tracking: [#28](https://github.com/snattydev/cardinal-system/issues/28).

Next batch:
1. **N9** [#26](https://github.com/snattydev/cardinal-system/issues/26) — wrapper hops internal-only
2. **N2** [#21](https://github.com/snattydev/cardinal-system/issues/21) — Tasks v2 (wire orchestrator to assignment)
3. **N3** [#22](https://github.com/snattydev/cardinal-system/issues/22) — `/vaults` ACL
4. **N8** [#25](https://github.com/snattydev/cardinal-system/issues/25) — `/keys` Hermes snippet (blocked on N9)
5. **N4** [#23](https://github.com/snattydev/cardinal-system/issues/23) / **N6** [#24](https://github.com/snattydev/cardinal-system/issues/24) — cockpit / notifications
6. **N7** [#18](https://github.com/snattydev/cardinal-system/issues/18) — remaining Playwright (`/keys`, `/router`)

Backlog: [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md).

---

## Phases

| Phase | Name | Status | Roadmap |
|-------|------|--------|---------|
| 0 | Living Skeleton | Complete | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | Complete (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cardinal v2 (Blackboard + MCP + Pool) | Closing (v0.2.6) | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 2.5 | Cardinal v3 (Maintenance workers + Vaults Memory + SAO Cockpit) | In progress (N1 on `dev`) | [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md) |
| 3 | Knowledge Graph | Future | — |
| 4 | Automations | Future | — |

### Phase 2 — state (2026-09-14)

| Pillar | Done | Pending (GitHub) |
|--------|------|---------|
| 3 Blackboard | tasks CRUD, WS, mailbox API, UI `/tasks`, MCP board tools, mailbox MCP | N2 Tasks v2 [#21](https://github.com/snattydev/cardinal-system/issues/21) |
| 1 MCP hub | `packages/mcp` memory + board + mailbox, compose `:8789` | N3 `/vaults` [#22](https://github.com/snattydev/cardinal-system/issues/22) |
| 2 Pool/router | router, key factory, `/keys` create+expiry+USD, dashboard `/router`, fusion/MoA | N8 snippet [#25](https://github.com/snattydev/cardinal-system/issues/25); N9 wrappers [#26](https://github.com/snattydev/cardinal-system/issues/26) |
| 5 Worker pool | N1 orchestrator + worker image (library; no task HTTP yet) | N2 trigger [#21](https://github.com/snattydev/cardinal-system/issues/21) |

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
