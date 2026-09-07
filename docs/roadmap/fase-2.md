# Phase 2 — Cardinal v2 (Blackboard + MCP Hub + Key Pool)

> Spec: [`../superpowers/specs/2026-08-12-cardinal-v2-architecture.md`](../superpowers/specs/2026-08-12-cardinal-v2-architecture.md)
> Execution plan: [`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md)
> Status: In progress (v0.2.5, updated 2026-09-03).
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
| 2 | Key pool + router | Complete (router + key factory + `/keys` create/expiry/USD + dashboard JWT `/router` + fusion/MoA — v0.2.5) |

## What is retained from original design

From the original Phase 2 roadmap (2.1–2.5), only **2.1 LLM Router** and
**2.2 API Key Factory** are retained (now inside pillar 2). 2.3/2.4/2.5 (one-shot Podman,
PR Review Pipeline, @mention) are replaced by blackboard + herdr/MCP
integration — do not reimplement orchestration.

## Progress

```
Pillar 3 (blackboard): tasks CRUD [x] · WS broadcast [x] · mailbox API [x] · UI /tasks [x] · MCP board tools [x] · mailbox MCP [x]
Pillar 1 (MCP):        memory tools [x] · board tools [x] · mailbox tools [x] · compose :8789 [x]
Pillar 2 (pool):       router [x] · key factory [x] · `/keys` create+limits [x] · `/router` dashboard JWT [x] · fusion/MoA [x] · pool opencode-go spike-003 [ ]
```

Backlog details and execution order in
[`../superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md).
