# Cardinal System — Roadmap

> Updated: 2026-10-06. Single source of truth for priorities.

---

## Now: Phase 2 complete on `main` (v0.2.6); v3 started on `dev`

Phase 1 (Context Store) has been complete since v0.2.0. Phase 2 (blackboard +
MCP hub + router/keys + SAO baseline + Playwright start) is on `main`.
Freeze PR [`dev → main` #12](https://github.com/snattydev/cardinal-system/pull/12)
merged 2026-09-18 (`Closes #16`, `#17`, `#19`). See
[`roadmap/fase-2.md`](roadmap/fase-2.md).

Product code on `dev` that is not on `main` is the N1 maintenance worker.
PR [#36](https://github.com/snattydev/cardinal-system/pull/36) merged to `dev`
on 2026-10-05 (`packages/worker`, `backend/src/orchestrator`,
`deploy/Containerfile.worker`). Version on both branches is still **0.2.6**.
No git tags. No GitHub Actions workflows.

[#20](https://github.com/snattydev/cardinal-system/issues/20) stayed open after
that merge: GitHub applies `Closes #N` on the default branch (`main`) only.
The 2026-10-06 QA reported it open. Manual close is part of
[#49](https://github.com/snattydev/cardinal-system/issues/49).

v3 tracking: [#28](https://github.com/snattydev/cardinal-system/issues/28).

Next on the v3 backlog:
1. **N9** [#26](https://github.com/snattydev/cardinal-system/issues/26) — wrapper hops internal-only
2. **N2** [#21](https://github.com/snattydev/cardinal-system/issues/21) — Tasks v2 (N1 is on `dev`; the task API does not call the worker yet)
3. **N3** [#22](https://github.com/snattydev/cardinal-system/issues/22) — `/vaults` ACL
4. **N8** [#25](https://github.com/snattydev/cardinal-system/issues/25) — `/keys` Hermes snippet (blocked on N9)
5. **N4** [#23](https://github.com/snattydev/cardinal-system/issues/23) / **N6** [#24](https://github.com/snattydev/cardinal-system/issues/24) — cockpit / notifications
6. **N7** [#18](https://github.com/snattydev/cardinal-system/issues/18) — remaining Playwright (`/keys`, `/router`)

Backlog: [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md).

### Follow-ups opened 2026-10-06

Proposed work. These pages only link the issues.

| Issue | Topic |
|-------|--------|
| [#40](https://github.com/snattydev/cardinal-system/issues/40) | Fusion hops meter tokens and skip USD budgets |
| [#41](https://github.com/snattydev/cardinal-system/issues/41) | `GET /v1/models` has no auth; document `GET /api/router/catalog` |
| [#42](https://github.com/snattydev/cardinal-system/issues/42) | GitHub Actions; widen typecheck and add lint |
| [#43](https://github.com/snattydev/cardinal-system/issues/43) | Rate-limit login, chat completions, and WS auth |
| [#44](https://github.com/snattydev/cardinal-system/issues/44) | MCP RAG search should forward the caller Bearer |
| [#45](https://github.com/snattydev/cardinal-system/issues/45) | Deploy headers, non-root `USER`, pin image digests |
| [#46](https://github.com/snattydev/cardinal-system/issues/46) | Rewrite [`stack.md`](stack.md) (Phase 2 status in this roadmap is updated; the stack page is not) |
| [#47](https://github.com/snattydev/cardinal-system/issues/47) | CHANGELOG, tag `v0.2.6`, PATCH bump on `dev` |
| [#48](https://github.com/snattydev/cardinal-system/issues/48) | Board and mailbox scopes on agent routes |
| [#49](https://github.com/snattydev/cardinal-system/issues/49) | Housekeeping (close #20 by hand, stale branches, draft PRs) |
| [#31](https://github.com/snattydev/cardinal-system/issues/31) | English-only sweep |

---

## Phases

| Phase | Name | Status | Roadmap |
|-------|------|--------|---------|
| 0 | Living Skeleton | Complete | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | Complete (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Cardinal v2 (Blackboard + MCP + Pool) | Complete on `main` (v0.2.6, PR #12, 2026-09-18) | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 2.5 | Cardinal v3 (Maintenance workers + Vaults Memory + SAO Cockpit) | N1 on `dev` (PR #36, 2026-10-05); rest planning ([#28](https://github.com/snattydev/cardinal-system/issues/28)) | [`superpowers/plans/2026-09-07-cardinal-v3-backlog.md`](superpowers/plans/2026-09-07-cardinal-v3-backlog.md) |
| 3 | Knowledge Graph | Future | — |
| 4 | Automations | Future | — |

### Phase 2 — state on `main` (2026-10-06)

| Pillar | On `main` (v0.2.6) | Later (GitHub) |
|--------|------|---------|
| 3 Blackboard | tasks CRUD, WS, mailbox API, UI `/tasks`, MCP board tools, mailbox MCP | N2 Tasks v2 [#21](https://github.com/snattydev/cardinal-system/issues/21); board/mailbox scopes [#48](https://github.com/snattydev/cardinal-system/issues/48) |
| 1 MCP hub | `packages/mcp` memory + board + mailbox, compose `:8789` | N3 `/vaults` [#22](https://github.com/snattydev/cardinal-system/issues/22); caller Bearer on RAG search [#44](https://github.com/snattydev/cardinal-system/issues/44) |
| 2 Pool/router | router, key factory, `/keys` create+expiry+USD, dashboard `/router`, fusion/MoA (token metering) | Fusion USD metering [#40](https://github.com/snattydev/cardinal-system/issues/40); auth on `GET /v1/models` [#41](https://github.com/snattydev/cardinal-system/issues/41); N8 snippet [#25](https://github.com/snattydev/cardinal-system/issues/25); N9 wrappers [#26](https://github.com/snattydev/cardinal-system/issues/26) |
| 5 Worker pool | — (out of the freeze) | N1 is on `dev` only ([#36](https://github.com/snattydev/cardinal-system/pull/36)). [#20](https://github.com/snattydev/cardinal-system/issues/20) still needs a manual close |

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
