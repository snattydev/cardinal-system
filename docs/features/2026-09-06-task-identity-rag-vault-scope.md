# Binding de identidad en `/api/tasks` + vault scopes en RAG (2026-09-06)

Cierra dos findings MEDIUM del security review: IDOR en el board (spoof de
`created_by`/`by` y complete de task ajena) y leak de vaults en
`POST /api/rag/search` cuando una key scoped pega al backend directo.

## Qué se hizo

### Tasks (`/api/tasks` create / claim / complete)

Dual-auth ya existía (`requireDashboardOrAgentKey`). El binding de identidad,
que mailbox ya tenía, ahora aplica al board:

- **JWT dashboard:** sin cambio. Body `created_by` / `by` se honra. Complete de
  cualquier task, incluyendo unclaimed.
- **Agent Bearer key:** `created_by` (create) y `assigned_to` (claim) siempre
  son `agent_name` de la key; el body se ignora. Complete → 403
  `{ error: "forbidden" }` salvo que `assigned_to ===` ese agente. Unclaimed
  también 403.
- Mismo helper que mailbox; se pasa `auth.agent` como override.

### RAG (`POST /api/rag/search`)

- JWT: resultados sin filtrar.
- Agent key: `vaultScopes` desde el JSON de scopes de la key.
  - `"*"` → sin filtrar
  - `vault:<name>` → se quedan resultados cuyo `path` contiene `/${name}/`
  - sin `*` ni `vault:` → `results: []` (200, no 403)
- El filtro corre **después** del lookup de cache: un hit cacheado sin filtrar
  no expone vaults ajenas.
- MCP sigue llamando RAG con `CARDINAL_SERVICE_KEY` (típicamente scopes
  `["*"]`) y sigue filtrando client-side. Las llamadas directas con key scoped
  ahora se filtran en el backend.

## Por qué

`docs/security.md`: keys **son** identidad. Mailbox ya ataba identidad; tasks
autenticaban la key y la descartaban (IDOR: spoof `created_by`/`by`, complete
de task de otro). RAG autenticaba cualquier key activa y devolvía todos los
vaults; MCP filtraba después, así que una key scoped pegando al backend
directo bypasseaba el allowlist.

## Decisiones

- Overwrite silencioso de `created_by`/`by` (no 403 por mismatch) — igual que
  mailbox `from_agent`. MCP ya manda `identity.agent`.
- Complete es 403 (no no-op silencioso) — igual que mailbox mark-read.
- Filtrar después del cache; no keyear el cache por scopes.
- No cambiar MCP para pasar la key del caller en RAG en este slice (service
  key `*` + filtro MCP client se queda; el filtro backend cubre el hueco de
  llamada directa).
- Sin version bump en este slice.

## Alternativas consideradas

- **403 cuando `created_by`/`by` no coincide con la key:** peor UX. MCP ya
  reenvía `identity.agent`; overwrite es fail-closed en identidad y sigue
  siendo 200.
- **Complete como no-op 200 si no es el assignee:** rechazado. Distinguir
  “no es tuyo” (403) de “no existe” (404), como mark-read.
- **Keyear el cache RAG por scopes:** más complejo, duplica entradas. Filtrar
  post-lookup evita el leak sin fragmentar el cache.
- **Pasar la key del caller MCP a RAG:** fuera de slice. El service key `*` +
  filtro client-side sigue; el backend ahora cubre el camino directo.

## Archivos

- Modificados: `backend/src/api/tasks.ts`, `backend/src/api/rag.ts`,
  `backend/src/server.ts`, `backend/src/api/tasks.test.ts`,
  `backend/src/api/api.test.ts`, `backend/src/server.test.ts`.
- Docs: este archivo; puntero en
  `docs/features/2026-08-31-mcp-mailbox-tools.md`; nota de enforce backend en
  `docs/features/2026-08-31-mcp-board-tools.md`; tabla de permisos en
  `docs/security.md`.

## Verificación

- Padre: `bun test` (repo root) → **435 pass / 0 fail**.
