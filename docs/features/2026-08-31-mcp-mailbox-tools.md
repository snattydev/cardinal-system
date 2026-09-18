# MCP mailbox tools + dual-auth on `/api/messages` (2026-08-31)

Item 14 of the Cardinal v2 backlog. Agents authenticated with `sk-cardinal-*`
can send and read blackboard mail via MCP, without a dashboard JWT.

## What was done

- MCP tools `cardinal_agent_send` and `cardinal_agent_inbox` (always listed, not
  vault-scoped). The MCP server proxies them to the backend using the caller's
  Bearer key.
- Dual-auth JWT cookie **or** agent key on `GET`/`POST /api/messages` and
  `PUT /api/messages/:id/read`, reusing the shared helper from `/api/tasks`.
- Identity binding for agent keys (fail-closed):
  - **No `from_agent` spoofing:** backend overwrites with the key's `agent_name`.
  - **No reading other agents' inboxes:** `GET` forces `to_agent` to the key's agent
    (ignores spoofed query parameter).
  - **No marking other agents' mail as read:** `PUT .../read` returns 403 `forbidden`
    if the message exists but the mailbox does not belong to the key's agent; 404
    if it does not exist.
- Dashboard JWT (admin) retains full access: any agent's inbox, unrestricted `from_agent`
  on send, mark-read on any message.
- Root README updated to **v0.2.4** / Fase 2. Version bump to **0.2.4** in `package.json`.

## Why

The MCP board already existed (`cardinal_task_*` + dual-auth on `/api/tasks`). The
mailbox API (`messages`) remained JWT-only, preventing agents (herdr / Hermes / CLIs)
authenticating with keys from executing direct handoffs.

Security review of the dual-auth pattern: authenticating a key **without binding identity**
is an IDOR vulnerability (one agent reads or writes another's mailbox). `docs/security.md`
establishes that keys **are** identity.

## Decisions

- Named tools `cardinal_agent_send` / `cardinal_agent_inbox` (`cardinal_` prefix,
  matching board and memory). The v2 spec lists `agent_send` / `agent_inbox` without
  a prefix; aligning wire names with the rest of the MCP surface took precedence.
- Overwriting `from_agent` (instead of 403) so MCP clients already sending
  `from_agent=identity.agent` continue to receive 200. Effective identity is always
  derived from the key.
- Enforcing inbox to key's agent (ignoring spoofed queries) rather than returning 403.
  The agent sees its mail without leakage about unauthorized queries.
- Mark-read: 404 if message does not exist; 403 if it exists but belongs to another
  mailbox. Distinguishes "does not exist" from "not yours" without leaking non-existent IDs.
- No MCP tool for mark-read: the v2 spec only requests send/inbox.
- Dual-auth in `/api/tasks` did not change its identity model in this slice (out of
  scope). Board identity binding: [`2026-09-06-task-identity-rag-vault-scope.md`](./2026-09-06-task-identity-rag-vault-scope.md).

## Alternatives Considered

- **Dual-auth without identity binding:** rejected. Any active key could read or
  write another's mailbox (IDOR). Violates "keys are identity".
- **403 when `from_agent` does not match key:** worse UX. MCP clients forwarding
  `identity.agent` would fail; overwrite is fail-closed on identity and remains 200.

## Files

- Modified: `backend/src/server.ts`, `backend/src/api/messages.ts`,
  `backend/src/server.test.ts`, `packages/mcp/src/server.ts`,
  `packages/mcp/src/server.test.ts`, `README.md`, `package.json` (0.2.4).
- Docs: `docs/features/2026-08-31-mcp-mailbox-tools.md`,
  `docs/features/2026-08-31-mcp-board-tools.md` (out of scope),
  `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`,
  `docs/roadmap.md`, `docs/roadmap/fase-2.md`, `AGENTS.md`.

## Verification

- Parent: `bun test --timeout 30000 packages/mcp/src backend/src` -> **185 pass /
  0 fail**.
