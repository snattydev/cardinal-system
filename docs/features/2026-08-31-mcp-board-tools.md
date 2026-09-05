# MCP board tools + dual-auth on `/api/tasks`

## What

Agents can drive the blackboard through the MCP server without a dashboard JWT.

- MCP tools: `cardinal_task_create`, `cardinal_task_list`, `cardinal_task_claim`, `cardinal_task_complete`
- Backend `/api/tasks*` accepts either a session cookie (dashboard) or an active `sk-cardinal-*` Bearer key
- Claim uses the key's agent name as `assigned_to`; create sets `created_by` to that agent

## Why

Cardinal v2 MCP surface (spec 2026-08-12) lists board tools after the multi-vault MCP hub. Memory tools were already live; board was the next gap. Agents (herdr/Hermes/CLIs) authenticate with keys, not JWT cookies.

## How

- `backend/src/server.ts`: `requireDashboardOrAgentKey` shared helper for all task routes
- `packages/mcp/src/server.ts`: board tools always listed; memory tools still gated by vault scopes; board calls proxy to backend with the caller's Bearer key
- Keys without vault scopes still see board tools (board is not vault-scoped)

## Out of scope (follow-ups)

- ~~Mailbox MCP tools (`agent_send` / `agent_inbox`) — same dual-auth pattern on `/api/messages`~~ **Hecho** — [`2026-08-31-mcp-mailbox-tools.md`](./2026-08-31-mcp-mailbox-tools.md)
- `task_comment` / `task_get` if needed later
- Scope narrowing for board (e.g. `board` scope) — any active key can use tasks for now

## Tests

- `backend/src/server.test.ts` — JWT + agent key create/list/claim/complete
- `packages/mcp/src/server.test.ts` — tools/list composition + create/list/claim/complete proxy
