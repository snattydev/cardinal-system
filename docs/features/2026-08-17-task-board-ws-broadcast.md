# Task Board WS Broadcast (2026-08-17)

Real-time broadcast of blackboard changes to subscribed dashboards.

## What was done

When a task is created, claimed, or completed via REST, the backend emits a
`task_update` WebSocket event to all subscribed dashboards. The payload delivers
the task in camelCase (mirroring `agent_update`/`roster`).

## Why

The board is the cross-provider coordination primitive for Cardinal v2 (pillar 3).
For the dashboard to display it live — an agent creates a task and it appears
instantly, another claims it and the UI updates — push delivery is required rather
than polling. Without this, the board would remain blind until refreshed.

## Decisions

- `taskToPayload` mirrors `agentToPayload`: snake_case (DB) -> camelCase (wire),
  consistent with the rest of the WS channel.
- `broadcastTask(task)` made public on `Hub`, following the same pattern as
  `broadcastAgent`/`broadcastDevices`: iterates subscribed `this.dashboards`.
- Handlers `create/claim/complete` accept an optional `onChange?: (task: TaskRow) => void`
  instead of coupling to the Hub. They remain pure and testable; the server
  injects `hub.broadcastTask` as the callback.
- `onChange` is invoked ONLY after a successful mutation. Claiming a non-open
  task returns 409 and does NOT emit a broadcast (no state changed).

## Alternatives Considered

- **Couple handlers directly to Hub**: rejected — breaks handler purity and
  complicates unit testing (would require mocking WS).
- **Have the server inspect HTTP Response and re-parse the task**: fragile,
  re-parsing JSON to extract data the handler already possessed.

## Files

- Modified: `packages/ws/src/hub.ts`, `packages/ws/src/index.ts`,
  `backend/src/api/tasks.ts`, `backend/src/server.ts`,
  `packages/ws/src/hub.test.ts`, `backend/src/api/tasks.test.ts`

## Verification

- `bun test` -> 225 pass / 0 fail (7 new tests: 3 in hub + 4 in tasks).
- Typecheck: feature code typechecks cleanly. The script `bun run typecheck`
  fails due to a PRE-EXISTING error (`maxPayloadLength` in `server.ts:33` not
  recognized by `bun-types`), unrelated to this feature and pending separate
  resolution.

## Pending (out of scope for this feature)

- Consume `task_update` in the frontend (board UI).
- Mailbox (`messages`) for direct handoff.
- Expose tasks as MCP tools (spike-002).
