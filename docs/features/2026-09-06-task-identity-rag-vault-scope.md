# Identity binding in `/api/tasks` + vault scopes in RAG (2026-09-06)

Addresses two MEDIUM security review findings: blackboard IDOR (spoofing
`created_by`/`by` and completing another agent's task) and vault leakage in
`POST /api/rag/search` when a scoped key queries the backend directly.

## What was done

### Tasks (`/api/tasks` create / claim / complete)

Dual-auth already existed (`requireDashboardOrAgentKey`). Identity binding,
already implemented for mailbox, now applies to the board:

- **JWT dashboard:** unchanged. Request body `created_by` / `by` is honored.
  Completion of any task allowed, including unclaimed tasks.
- **Agent Bearer key:** `created_by` (create) and `assigned_to` (claim) are
  always the key's `agent_name`; request body is ignored. Complete -> 403
  `{ error: "forbidden" }` unless `assigned_to ===` that agent. Unclaimed
  tasks also return 403.
- Same helper as mailbox; `auth.agent` is passed as override.

### RAG (`POST /api/rag/search`)

- JWT: unfiltered results.
- Agent key: `vaultScopes` parsed from the key's scopes JSON.
  - `"*"` -> unfiltered
  - `vault:<name>` -> retains results where `path` contains `/${name}/`
  - without `*` or `vault:` -> `results: []` (200, not 403)
- The filter runs **after** cache lookup: an unfiltered cached hit does not
  expose foreign vaults.
- MCP continues querying RAG using `CARDINAL_SERVICE_KEY` (typically scopes
  `["*"]`) and continues client-side filtering. Direct calls using scoped keys
  are now filtered in the backend.

## Why

`docs/security.md`: keys **are** identity. Mailbox already bound identity; tasks
previously authenticated the key and discarded it (IDOR: spoofing `created_by`/`by`,
completing another agent's task). RAG previously authenticated any active key and
returned all vaults; MCP filtered afterwards, allowing a direct backend call with
a scoped key to bypass the allowlist.

## Decisions

- Silent overwrite of `created_by`/`by` (no 403 on mismatch) — matching mailbox
  `from_agent`. MCP already forwards `identity.agent`.
- Complete returns 403 (not silent no-op) — matching mailbox mark-read.
- Filter after cache; do not key cache by scopes.
- Do not modify MCP to forward caller key to RAG in this slice (service key `*` +
  MCP client filter remains; backend filter covers direct calls).
- No version bump in this slice.

## Alternatives Considered

- **403 when `created_by`/`by` does not match key:** worse UX. MCP already
  forwards `identity.agent`; overwrite is fail-closed on identity and remains 200.
- **Complete as no-op 200 if not assignee:** rejected. Distinguishes "not yours"
  (403) from "not found" (404), matching mark-read.
- **Key RAG cache by scopes:** more complex, duplicates entries. Post-lookup
  filtering prevents leaks without fragmenting cache.
- **Pass MCP caller key to RAG:** out of slice. Service key `*` + client-side
  filtering continues; backend now covers direct path.

## Files

- Modified: `backend/src/api/tasks.ts`, `backend/src/api/rag.ts`,
  `backend/src/server.ts`, `backend/src/api/tasks.test.ts`,
  `backend/src/api/api.test.ts`, `backend/src/server.test.ts`.
- Docs: this file; pointer in
  `docs/features/2026-08-31-mcp-mailbox-tools.md`; backend enforcement note in
  `docs/features/2026-08-31-mcp-board-tools.md`; permissions table in
  `docs/security.md`.

## Verification

- Parent: `bun test` (repo root) -> **435 pass / 0 fail**.
