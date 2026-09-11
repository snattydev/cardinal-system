# Cardinal v3 — Backlog & Execution Plan (post router)

> Complements the living spec `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`
> and its backlog `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`.
> Status: v0.2.6 (2026-09-10). Fase 2 complete in `dev` (router, keys, blackboard, MCP hub).
> Re-scoped 2026-09-10: Cardinal 24/7 server model, division of labor (lightweight
> internal maintenance workers vs persistent Herdr agents), memory monolith (`/vaults`),
> Cockpit Command (`Ctrl+K`) + Herdr Web TUI view (replacing bloated chat), and SAO Design System.

## Why a v3

v2 closes the foundational four pillars: identity, key pool/router, blackboard+mailbox,
and MCP context hub. The 2026-09-10 architectural alignment refines the next phase:

1. **Lightweight Internal Workers (N1):** Ephemeral Podman containers running a minimal
   Bun + MCP runtime for system maintenance, memory hygiene, and background summarization.
   Heavy coding and architecture remain sovereign to persistent Herdr agents (Kirito, Lisbeth, Agil)
   or developer workstation CLIs.
2. **Tasks v2 (N2):** Clean task lifecycle (`pending | running | done | failed`). Assign triggers
   internal maintenance workers or routes to the blackboard for persistent agents.
3. **Memory Monolith (`/vaults` - N3):** All system and personal knowledge unifies as Markdown (`.md`)
   in `/vaults` on the 24/7 server. Structured categories (`personal/`, `cardinal-system/`, `projects/`,
   `knowledge/`, `agents/`) protected by path-based ACL in `agent_keys.scopes` and automated backup jobs.
4. **Cockpit Command & Herdr View (N4):** Replaces generic multi-turn chatbot with a rapid
   SAO-style Command Bar (`Ctrl+K` for instant queries and actions) and an embedded Web TUI
   viewer to monitor and command the persistent Herdr container.
5. **SAO Design System (N5):** Complete visual cohesion across the dashboard with Obsidian/Graphite
   surfaces, Aincrad Orange primary actions, Sinon Turquoise telemetry, Underworld Purple security badges,
   Slash Red error cutoffs, floating angular panels, and an optional audio pack.
6. **In-App Notification Center (N6):** Visible home for task completion, security alerts, and system health.
## Spawn Rule (v3 Update)

Spec `2026-08-12-cardinal-v2-architecture.md` §3 stated in v2:

> **Hard rule:** Cardinal NEVER tells herdr "spawn an agent".

That rule **remains in place for CLI agents** (opencode, claude, cursor,
codex) — herdr continues managing those as before. But v3 introduces
a second category: **Cardinal's own workers** running in ephemeral
containers. Cardinal can create and terminate those containers.

- Cardinal can create and destroy containers running its own base image.
- Those containers run a Cardinal worker (not an external CLI).
- They are used for one-shot tasks, the chatbot, and any automated
  execution that does NOT require human judgment in a TUI.
- herdr remains the sole owner of the local CLI agent roster.

This revives the original roadmap item 2.3 ("One-Shot Agents Podman") that
was dropped during the Fase 2 re-scope. The difference from the old design:
the containers are no longer "generic agents"; they are **Cardinal workers
with a JSON stdin/stdout contract and bounded scope**.

## Status at v2 Close

| Pillar | Status |
|---|---|
| 4 — Identity (`sk-cardinal-*`) | [done] Fase 0 |
| 2 — Key pool + router | [done] router + key factory + `/keys` create/expiry/USD + JWT `/router` dashboard + fusion/MoA (v0.2.5) |
| 3 — Blackboard + mailbox | [done] tasks CRUD + WS + mailbox API + `/tasks` UI + MCP board + MCP mailbox |
| 1 — MCP multi-vault | [done] memory + board + mailbox tools (`packages/mcp`, compose `:8789`) |

## Backlog (New Order, 2026-09-07)

| # | Item | Type | Fase | Priority | TDD | Depends on |
|---|------|------|------|----------|-----|------------|
| 5 | [done] Seed providers/routes (`scripts/seed-router.py`) | spike/e2e | F2 | P0 | — | 6, 7 (v2) |
| 10 | PR `dev->main` — stabilize Fase 1 + blackboard + router + MCP | release | F2 | P1 | — | all |
| 11 | [done] Bootstrap admin password without the model (`scripts/bootstrap-admin-password.sh`) | security/deploy | F2 | P0 | — | cloud blocker |
| 13 | One-shot keys — compact block + hard-delete on completion (revive with N1) | feature | F2 | P1 | Yes | N1 |
| **N1** | **Internal maintenance worker** (ephemeral Podman container, Bun + MCP runtime, JSON stdin/stdout contract, scoped keys, TTL cleanup) | infra | F2 | **P0** | Yes | router closed ([done]) |
| **N2** | **Tasks v2: assignment triggers maintenance worker, auto-fire toggle** (clean migration: `pending | running | done | failed`) | feature | F2 | **P1** | Yes | N1 |
| **N3** | **Memory Monolith (`/vaults`) & Path ACL** (`personal/`, `cardinal-system/`, `projects/`, `knowledge/`, `agents/`; path-level scopes in `agent_keys.scopes`; backup snapshot job) | feature | F3 | **P1** | Yes | N1 |
| **N4** | **Cockpit Command & Herdr Web TUI** (SAO `Ctrl+K` quick query/RAG bar + embedded Web TUI view to server Herdr container) | feature | F2 | **P2** | Yes | N1, N5 |
| **N5** | **SAO Design System** (Obsidian `#0A0B0E`, Graphite `#12151D`, Aincrad Orange `#FF7A00`, Sinon Turquoise `#00F0FF`, Underworld Purple `#8A3FFC`, Slash Red `#FF2A4D`, floating panels, audio pack) | feature | F2 | **P2** | No | parallel to N1 |
| **N6** | **In-app notification center** (persisted, snooze, linked to task/agent/security events) | feature | F2 | **P2** | Yes | N2 |

> Items marked with `[done]` belong to the v2 backlog and are already closed.
> Items **N1–N6** are new. Items **5, 10, 11, 13** from v2 remain active;
> 13 changes form (bound to N1).

## Decisions

- **N1 is lightweight maintenance only (Division of Labor).** Workers in Cardinal
  run minimal Bun + MCP loops. They do NOT compile or replace Herdr/OMP for heavy coding.
  If a maintenance worker encounters a critical problem, it logs an escalation event.
- **Tasks v2 (N2) is a clean cutover.** Remove `claim`/`complete` endpoints.
  Tasks move to `pending | running | done | failed`.
- **Memory is a single hierarchical `/vaults` tree.** No scattered stores.
  Strict path-level authorization enforced on backend before filesystem access.
  `personal/` is strictly denied to all agent keys.
- **No bloated UI Chatbot.** Replaced by a fast `Ctrl+K` Spotlight command bar
  and an embedded Web TUI for direct Herdr monitoring.
- **In-app notifications only.** Keep core tight without external push dependencies.
- **Feature development tools:** Core features (N1, N2, N3) use mandatory TDD.
  Frontend and visual design (N4, N5) rely on visual verification and design tokens.
- **Target version:** v0.3.0 once N1+N2+N3 land in `dev`.
## Item Details (Minimum Scope)

### N1 — Internal Maintenance Worker

- Base container image `cardinal-worker:latest` (minimal Bun runtime + `@cardinal/mcp` client,
  no heavy dev tools; network bounded to Cardinal internal ports).
- I/O contract: JSON via stdin/stdout.
  - Input: `{ task_id, task_type: "maintenance" | "summary" | "hygiene", prompt, memory_scopes, timeout_s, callback_url }`.
  - Output: `{ task_id, status: "success" | "failure", summary, memory_writes, escalation?: string }`.
- Lifecycle: backend spawns worker container via Podman with dedicated ephemeral `sk-cardinal-*` key.
  Awaits stdout or hard timeout (default 5 min), collects output, and runs `podman rm -f`.
- Security: container has NO direct SQLite DB access, NO host root, NO provider keys.
  Communicates solely via Cardinal Router and MCP using scoped ephemeral key.
- TDD: JSON protocol + timeout handler + mock podman driver.
- Estimated files: `packages/worker/` (new), `backend/src/orchestrator/` (new),
  `infra/containers/cardinal-worker.Containerfile`.

### N2 — Tasks v2 (Maintenance Trigger)

- Schema migration: `tasks.status` moves to `pending | running | done | failed`.
- Endpoints:
  - `POST /api/tasks { title, prompt, auto_fire?: bool=true, target?: "internal" | "board" }`
    -> if `auto_fire=true` and `target="internal"`, triggers N1 worker immediately.
  - `POST /api/tasks/:id/cancel` -> terminates container if running, marks `failed`.
  - Deprecated `claim` and `complete` removed.
- UI `/tasks`: "Auto-fire" toggle, status badges, cancel button.
- TDD: task lifecycle reducer + N1 trigger integration.

### N3 — Memory Monolith (`/vaults`) & Path ACL

- File tree living on 24/7 server host:
  ```
  /vaults/
    ├── personal/         --> Strictly restricted (human only; denied to all agent keys)
    ├── cardinal-system/  --> Specs, core rules, system directives
    ├── projects/         --> Project documentation and architecture
    ├── knowledge/        --> Frameworks, papers, technical guides
    └── agents/           --> Agent scratchpads, decision logs, shared handoffs
          ├── kirito/
          ├── lisbeth/
          └── shared/
  ```
- Authorization: Path-based scopes in `agent_keys.scopes`:
  - `memory:read:<path-glob>`
  - `memory:append:<path-glob>`
  - `memory:write:<path-glob>`
- Backend ACL middleware verifies paths strictly, preventing directory traversal (`..`)
  and blocking any agent key from accessing `personal/*`.
- Backup script: automated incremental snapshot job to secondary disk/backup location.
- TDD: ACL path matcher + permission enforcement + traversal prevention.

### N4 — Cockpit Command (`Ctrl+K`) & Herdr Web TUI

- **Cockpit Command Bar:** Floating modal triggered by `Ctrl+K`. Fast query to RAG,
  system status check, or quick maintenance task trigger. No conversational thread bloat.
- **Herdr Web TUI Viewer:** Embedded web terminal pane (via WebSocket PTY/ttyd)
  connecting directly to the persistent Herdr container on the server, allowing live
  supervision of Kirito, Lisbeth, and Agil from any browser.
- Files: `frontend/src/components/CommandBar.tsx`, `frontend/src/pages/HerdrTerminal.tsx`.

### N5 — SAO Design System & Production Quadlet [done]

- Design specification: `docs/superpowers/specs/2026-09-10-sao-design-system.md`.
- Tokens & primitives: Obsidian (`#0A0B0E`), Graphite (`#12151D`), Aincrad Orange (`#FF7A00`),
  Sinon Turquoise (`#00F0FF`), Underworld Purple (`#8A3FFC`), Slash Red (`#FF2A4D`).
- Primitives: `Card`, `Badge`, `Button`, `Input` in `frontend/src/components/ui/`.
- Pages migrated: `Layout.tsx`, `Login.tsx`, `Tasks.tsx`, `Overview.tsx`, `AgentCard.tsx`.
- Production deployment: Rootless Podman Quadlets running under systemd --user (`cardinal-pod`,
  `cardinal-backend`, `cardinal-frontend`, `cardinal-caddy`) publishing port 8080.
- Future visual refinement (post-v0.3.0): extract palette directly from anime frames + authentic chamfered HUD elements (see spec §7).
### N7 — Automated UI Testing via Cloud Cursor & Playwright

- Framework: `@playwright/test` configured in `frontend/playwright.config.ts`.
- E2E specs: `frontend/e2e/auth-and-dashboard.spec.ts` (Login, redirects, SAO elements).
- Execution modes:
  - Local: `bun run --cwd frontend playwright test` against `http://127.0.0.1:8080`.
  - Cloud Cursor: Uses `@cursor/sdk` to dispatch cloud agents on feature branches for visual regression and PR generation once `CURSOR_API_KEY` is supplied in `.env`.
### N6 — In-App Notification Center

- `notifications` table (id, target, type, payload, read, created_at).
- Triggers: task completion/failure, worker timeout, ACL security denials.
- UI: Top-bar bell badge, notification drawer, snooze options.
- TDD: persistence + notification emitter.
## Proposed Execution Order

```
P0: 5 (seed router) ──────────┐
                              ├─ all green in dev -> freeze Fase 2
P0: 11 (password script) ─────┘
                                │
P1: 10 (PR dev->main) ────────── clean baseline v0.2.6
                                │
P0: N5 (SAO Design System) ─────┴─ frontend foundation
                                │
P0: N1 (maintenance worker) ────┬─ unblocks tasks v2
                                │
P1: N2 (tasks v2) ──────────────┼─ automated maintenance
                                │
P1: N3 (/vaults memory + ACL) ──┼─ secure context SSOT
                                │
P2: N4 (Ctrl+K + Herdr view) ───┼─ interactive cockpit
                                │
P2: N6 (notification center) ───┘─ feedback loop
```

## Next Step

1. Close **5** (e2e zen) and **11** (password TTY) — remaining v2 blockers.
2. PR **10** `dev->main` with accumulated changes.
3. Branch `feature/N1-cardinal-worker` with detailed spec for containerized agentic backend.
4. After N1 passes green, the remainder can run in one- or two-item sprints following table order.

## Lessons from v2 Backlog Applied to v3

- **Tests first in core, not in frontend.** N1, N2, N3, N4, N6 -> mandatory TDD.
  N5 -> visual verification.
- **The bottleneck was verification, not the model.** N1 introduces real
  containers -> the bottleneck will be Podman setup in CI and locally. Run spike
  prior to implementation.
- **Unified suite at the close of every sprint.** Do not rely on per-agent
  assertions: ground truth is `bun test` run from root.
