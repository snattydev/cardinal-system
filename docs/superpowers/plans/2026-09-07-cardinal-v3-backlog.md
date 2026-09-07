# Cardinal v3 — Backlog & Execution Plan (post router)

> Complements the living spec `docs/superpowers/specs/2026-08-12-cardinal-v2-architecture.md`
> and its backlog `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`.
> Initial status: v0.2.5 (2026-09-03). Fase 2 advanced in `dev`. Router closed.
> Re-scope 2026-09-07: now that the router is in place, one-shot container agents,
> tasks v2 (assign triggers agent), chatbot, scoped memory, design system,
> and notifications are enabled.

## Why a v3

v2 closes the four pillars: identity, key pool/router, blackboard+mailbox,
and MCP context hub. But the 2026-09-03 sprint (router) and the 2026-09-07
discussion leave three explicit requests:

1. **Tasks without claim/complete.** The current model (`open | claimed | done |
   blocked`) leaves agent triggering to the human. Request: on task creation,
   a toggle triggers a one-shot agent that solves it. The human assigns; they do
   not claim.
2. **UI AI Chatbot.** Embedded Hermes (or similar) to converse and trigger actions
   from the UI. Same agentic backend as tasks.
3. **`/memory` with per-key/agent scopes.** Three levels: read, write-existing,
   append-new. The current vault is reborn as a centralized module.

Accompanying items: design system + critical screen redesign sprint (the current
UI lacks conventions and polish), and an in-app notification center (task, agent,
and memory events require a visible home).

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
| **N1** | **Containerized agentic backend** (podman quadlet, base image, JSON stdin/stdout contract, lifecycle, TTL, cleanup) | infra | F2 | **P0** | Yes | router closed ([done]) |
| **N2** | **Tasks v2: no claim/complete, assign triggers one-shot, auto-fire toggle** (clean migration: `pending | running | done | failed | cancelled`) | feature | F2 | **P1** | Yes | N1 |
| **N3** | **`/memory` module with scoped permissions** (read / write-existing / append-new; per-key and per-agent; existing vault migrates as initial dataset) | feature | F3 | **P1** | Yes | N1 |
| **N4** | **UI AI Chatbot** (embedded Hermes, WS, persisted conversations, triggers one-shots without auto-fire) | feature | F2 | **P2** | Yes | N1, N2, N5 |
| **N5** | **Design system + critical screen redesign sprint** (palette, tokens, primitive components + migration of `/keys`, `/router`, `/tasks`, chat) | feature | F2 | **P2** | No | parallel to N4 |
| **N6** | **In-app notification center** (persisted, snooze, linked to task/agent/memory events) | feature | F2 | **P2** | Yes | N2 |

> Items marked with `[done]` belong to the v2 backlog and are already closed.
> Items **N1–N6** are new. Items **5, 10, 11, 13** from v2 remain active;
> 13 changes form (bound to N1).

## Decisions

- **N1 is the real blocker.** Without workers in containers, there is no honest
  way to implement task assignment or the chatbot. It must be completed before any new feature.
- **Tasks v2 (N2) is a clean cutover.** The `claim`/`complete` endpoints from the
  current model will be removed when the new version lands. No deprecated coexistence.
- **Auto-fire applies only to tasks.** Chat (N4) does NOT auto-trigger agents
  upon detecting executable intent — the human must confirm.
- **`/memory` is a rename of the vault + new module.** Three independent permission
  levels: `read` (read entries), `write-existing` (edit existing entries),
  `append-new` (create new entries without modifying old ones). Scopes per key
  (`agent_keys.scopes`) and per agent (agent configuration).
- **In-app notifications only.** Email, web push, and Telegram remain out of scope
  for this sprint; they can be added as delivery channels to the same center later.
- **Feature CLI:** N1, N2, N3 -> **cursor-agent** (under current rules).
  N4, N5, N6 -> decided per sprint (N5 in particular can be handled directly: pure frontend, TDD does not apply).
- **Target version:** v0.3.0 once N1+N2 land in `dev`. v0.3.x progressively integrates N3–N6.

## Item Details (Minimum Scope)

### N1 — Containerized Agentic Backend

- Base image `cardinal-worker:latest` (Bun runtime + Cardinal worker,
  no external CLIs; no open network except what the orchestrator declares).
- I/O contract: JSON via stdin/stdout.
  - Input: `{ task_id, prompt, memory_scopes, allowed_models, timeout_s,
    callback_url, secrets_ref }`.
  - Output: `{ task_id, status, summary, artifact_ref, memory_writes,
    notifications }`.
- Lifecycle: the backend spawns a podman quadlet per invocation, awaits
  output (or timeout), parses it, and runs `podman rm` on exit. Hard TTL
  configurable per sprint (default 10 min).
- Cleanup: `One-shot cleanup` cron (already exists in `docs/cronjobs.md` #13)
  sweeps zombie containers; new cron `cardinal-worker image prune`
  runs weekly (matching pattern in #14).
- Security: container has NO direct DB access, NO real provider keys,
  NO access to other tenants. Only what the orchestrator supplies via
  stdin and secrets_ref (resolved by the backend prior to spawn).
- TDD: JSON contract + output reducer + timeout handling. Podman integration
  can use a test double (driver interface).
- Estimated files: `packages/worker/` (new), `packages/core/` (extend with
  `Worker*` types), `backend/src/orchestrator/` (new),
  `infra/quadlets/cardinal-worker.*` (new).

### N2 — Tasks v2 (Assign Triggers One-Shot)

- Schema migration: `tasks.status` moves from
  `open | claimed | done | blocked` to `pending | running | done | failed
  | cancelled`. Append SQL migration (no long table locks).
- Endpoints:
  - `POST /api/tasks { title, prompt, auto_fire?: bool=true, ... }`
    -> if `auto_fire=true` (default), creates task in `pending` and triggers
    N1 with the prompt as input. Status transitions to `running`.
  - `POST /api/tasks/:id/assign` -> explicit equivalent to auto-fire.
  - `POST /api/tasks/:id/cancel` -> terminates container if `running`,
    marks `cancelled`.
  - `claim` and `complete` are removed. Old handlers and their tests are deleted.
- UI `/tasks`: buttons become "Assign" and "Cancel" (no more "Claim" / "Complete").
  "Auto-fire on create" toggle visible in creation form.
- Notification: when a task transitions to `done` or `failed`, emits event for N6.
- TDD: handlers + status reducer + N1 integration (mock driver).
- Estimated files: `packages/db/src/schema.ts` (migration),
  `packages/db/src/repos/tasks.ts`, `backend/src/api/tasks.ts`,
  `backend/src/api/tasks.test.ts`, `frontend/src/pages/Tasks.tsx`.

### N3 — `/memory` Module with Scoped Permissions

- Existing vault moves to `packages/memory/` and is renamed `/memory`
  in the dashboard.
- Permission model (three independent levels):
  - `read`: read entries.
  - `write-existing`: edit existing entries (cannot create new ones).
  - `append-new`: create new entries (cannot edit old ones).
- Scope via `agent_keys.scopes`: add new types to scopes JSON:
  `memory:read`, `memory:write-existing`, `memory:append-new`. Without
  at least one of the three, the key cannot access the module.
- Scope per agent: agent config file declares maximum permissions; N1
  never passes the container more permissions than the agent holds.
- ACL enforced on backend, not client. If MCP calls with service key `*`,
  the backend filters identically (matching RAG fix in
  `2026-09-06-task-identity-rag-vault-scope.md`).
- TDD: repos + ACL + tests for "key without scope cannot read" /
  "key with append-only cannot edit".
- Estimated files: `packages/memory/` (new), migration of existing vault,
  `backend/src/api/memory.ts`, extension of `packages/mcp/src/tools/`.

### N4 — UI AI Chatbot

- `/chat` page with bidirectional WS (same Hub as tasks).
- Model: embedded Hermes as N1 worker (same agentic backend).
- Conversations persisted in DB (`chat_threads` + `chat_messages` tables).
- No auto-fire: chat suggests actions, human confirms with one click.
- Confirmations trigger the same endpoints as `/tasks` and `/memory`.
- TDD: WS handlers + reducer + persistence. LLM logic tested with fake model.
- Estimated files: `backend/src/api/chat.ts`, `backend/src/ws/chat.ts`,
  `frontend/src/pages/Chat.tsx`, `packages/db/src/schema.ts` (migration
  for `chat_threads` and `chat_messages`).

### N5 — Design System + Critical Screen Redesign

- Base design system: tokens (color, spacing, typography, radius, shadow),
  primitive components (Button, Input, Card, Dialog, Toast, Tabs, Table, Badge),
  iconography pattern.
- Custom Cardinal palette (not default generic shadcn styling).
- Redesign sprint: migrate `/keys`, `/router`, `/tasks`, `/chat` (when available),
  `/memory` (when available) to the new design system.
- No TDD (visual frontend — manual verification + screenshots).
- Unspecified design choices: palette, typography, motion, icon set, layout grid.
  Proposed in a brief spec (`docs/superpowers/specs/YYYY-MM-DD-cardinal-design-system.md`)
  before implementation.
- Estimated files: `frontend/src/design/` (new), migrations of existing pages.

### N6 — In-App Notification Center

- `notifications` table (id, user_id/agent_id, type, payload, read, created_at).
- Trigger events: task `done`/`failed`, container timeout, memory write denied
  by ACL, chat reply received.
- UI: header bell with badge; drawer with list; snooze per notification and per type.
- Persistence: 30 days default; prune cron.
- TDD: handlers + reducer + snooze logic.
- Estimated files: `packages/db/src/schema.ts` (migration),
  `backend/src/api/notifications.ts`, `frontend/src/components/Notifications.tsx`.

## Proposed Execution Order

```
P0: 5 (e2e zen) ─────────┐
                         ├─ both block PR dev->main
P0: 11 (password TTY) ───┘
                           │
P1: 10 (PR dev->main) ───── clean cutoff for Fase 2

P0: N1 (agentic backend) ──────────┐
                                   ├─ unblocks N2, N3
P1: N2 (tasks v2) ───────┐         │
                         ├─ in     │
P1: N3 (/memory) ────────┴─ parallel
                                   │
P2: N5 (design system) ──┐         │
                         ├─ feeds  ├─ enables decent visual N4
P2: N4 (chatbot UI) ─────┘         │
                                   │
P2: N6 (notifications) ────────────┘ (depends on N2 for events)
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
