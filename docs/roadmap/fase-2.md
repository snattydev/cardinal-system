# Phase 2 — Cardinal v2 (Blackboard + MCP Hub + Key Pool)

> Spec: [`../superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](../superpowers/specs/2026-08-12-cardinal-v2-architecture.md)
> Execution plan: [`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md)
> Status: Complete on `main` (v0.2.6, updated 2026-10-06). Freeze PR [#12](https://github.com/snattydev/cardinal-system/pull/12) merged 2026-09-18 (`Closes #16`). N1 is outside this phase: on `dev` via PR [#36](https://github.com/snattydev/cardinal-system/pull/36) (2026-10-05), absent from `main`.
> Router surface sprint: [`../sprints/2026-09-03-router-surface.md`](../sprints/2026-09-03-router-surface.md)
> Index: [`../features/2026-09-03-router-surface.md`](../features/2026-09-03-router-surface.md)

---

## Re-scope (2026-08-12)

The original Phase 2 (One-Shot Pipeline) was re-scoped for Cardinal v2. Thesis:
**orchestration is commodity** — Cardinal is the brain (identity + context +
blackboard); herdr/Hermes/CLIs are the hands.

Four pillars:

| # | Pillar | Status |
|---|--------|--------|
| 4 | Identity `sk-cardinal-*` | Complete (Phase 0) |
| 3 | Blackboard + mailbox | Complete (mailbox MCP 2026-08-31) |
| 1 | Multi-vault MCP context hub | Complete (memory + board + mailbox tools in `packages/mcp`) |
| 2 | Key pool + router | Complete on `main` (router + key factory + `/keys` create/expiry/USD + dashboard JWT `/router` + fusion/MoA). Fusion meters tokens; USD metering on fusion hops is open [#40](https://github.com/snattydev/cardinal-system/issues/40). `GET /v1/models` has no auth; requiring it is [#41](https://github.com/snattydev/cardinal-system/issues/41). |

## What is retained from original design

From the original Phase 2 roadmap (2.1–2.5), only **2.1 LLM Router** and
**2.2 API Key Factory** are retained (now inside pillar 2). 2.3/2.4/2.5 (one-shot Podman,
PR Review Pipeline, @mention) are replaced by blackboard + herdr/MCP
integration. Generic CLI orchestration stays with herdr.

v3 later added Cardinal-owned maintenance workers (JSON stdin/stdout, ephemeral
key, Podman). That is N1, on `dev` only
([PR #36](https://github.com/snattydev/cardinal-system/pull/36),
[`../features/2026-10-05-internal-maintenance-worker.md`](../features/2026-10-05-internal-maintenance-worker.md)).
It is outside this freeze.

## Progress

```
Pillar 3 (blackboard): tasks CRUD [x] · WS broadcast [x] · mailbox API [x] · UI /tasks [x] · MCP board tools [x] · mailbox MCP [x]
Pillar 1 (MCP):        memory tools [x] · board tools [x] · mailbox tools [x] · compose :8789 [x]
Pillar 2 (pool):       router [x] · key factory [x] · `/keys` create+limits [x] · `/router` dashboard JWT [x] · fusion/MoA [x] · pool opencode-go spike-003 [ ]
```

Backlog details and execution order in
[`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md).
