# Blackboard Tasks — Table + CRUD (2026-08-12)

First feature of Cardinal v2's "Blackboard" pillar.

## What was done

`tasks` table + repos + handlers + JWT routes for cross-provider coordination
between agents. Linear/team-style model: tasks with status, assignee, parent/child
tree, bounded summary, and artifact_ref (pointer to the result, never the full
prose).

## Why

Validated in spike 001 (`spikes/001-blackboard-no-inflacion/`): two agents from
different providers (Hermes + opencode via herdr) coordinated towards a common
goal through a structured board without inflating context or touching memory.
The golden rule is "pull + refs": state lives in DB rows, agents query what they
need and exchange pointers, not transcripts.

## Decisions

- `tasks` as a new table (append migration, does not touch existing ones).
- id = `crypto.randomUUID()`.
- status CHECK: `open | claimed | done | blocked`.
- `claim` only from `open` -> 409 `{error: "not_open"}` otherwise. Prevents double
  claims (deduplication lesson from Nogal Hive).
- `complete` without previous status restriction; empty body = `{summary: null,
  artifact_ref: null}` (an agent can complete without a summary).
- `created_by` defaults to `"system"` (dynamic / one-shot keys), overridable.
- Routes `/api/tasks/:id/claim` and `/api/tasks/:id/complete` matched BEFORE the
  generic `/api/tasks/:id` to avoid consuming the suffix.

## Alternatives Considered

- **Single endpoint `/api/tasks/:id` with PATCH** (state in body): discarded,
  explicit actions (`claim`/`complete`) are clearer and less ambiguous.
- **Message queue (mailbox) in the same feature**: postponed. The board is the
  coordination primitive; direct mailbox (agent_send/inbox) is a separate feature
  when direct handoffs are required.

## Files

- Created: `backend/src/api/tasks.ts`, `backend/src/api/tasks.test.ts`
- Modified: `backend/src/server.ts`, `packages/core/src/types.ts`,
  `packages/core/src/index.ts`, `packages/db/src/schema.ts`,
  `packages/db/src/repos.ts`, `packages/db/src/index.ts`, `packages/db/src/db.test.ts`

## Verification

- `podman exec cardinal-backend sh -c 'cd /app && bun test'` -> 213 pass / 0 fail
  (full suite, not just new tests).
- Implemented by cursor-agent via herdr; verified by orchestrator across 3 layers
  (tests, diff, code review).
- Deviations from brief (justified): re-export in `db/index.ts`, updated table
  count (11->12) in `db.test.ts`.

## Pending (out of scope for this feature)

- Expose tasks as MCP tools (spike-002).
- Mailbox (`messages`) for direct handoff.
- WS broadcast of board changes to subscribed dashboards.
