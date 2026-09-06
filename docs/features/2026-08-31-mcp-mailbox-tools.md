# MCP mailbox tools + dual-auth on `/api/messages` (2026-08-31)

Item 14 del backlog Cardinal v2. Agentes autenticados con `sk-cardinal-*` pueden
enviar y leer mail del blackboard vía MCP, sin JWT de dashboard.

## Qué se hizo

- MCP tools `cardinal_agent_send` y `cardinal_agent_inbox` (siempre listadas, no
  vault-scoped). El server MCP las proxea al backend con el Bearer de la key del
  caller.
- Dual-auth JWT cookie **o** agent key en `GET`/`POST /api/messages` y
  `PUT /api/messages/:id/read`, reusando el mismo helper que `/api/tasks`.
- Binding de identidad para agent keys (fail-closed):
  - **No spoofea `from_agent`:** el backend sobreescribe con `agent_name` de la
    key.
  - **No lee inbox ajeno:** `GET` fuerza `to_agent` al agente de la key (ignora
    query spoofeado).
  - **No marca leído mail de otro:** `PUT .../read` responde 403 `forbidden` si el
    mensaje existe pero el mailbox no es del agente de la key; 404 si no existe.
- JWT de dashboard (admin) sigue con acceso total: inbox de cualquiera, send con
  `from_agent` libre, mark-read de cualquier mensaje.
- README raíz actualizado a **v0.2.4** / Fase 2. Version bump a **0.2.4** en `package.json`.

## Por qué

El board MCP ya existía (`cardinal_task_*` + dual-auth en `/api/tasks`). El
mailbox API (`messages`) seguía JWT-only, así que agentes (herdr / Hermes / CLIs)
que auth con keys no podían hacer handoff directo.

Security review del patrón dual-auth: autenticar la key **sin atar identidad** es
IDOR (un agente lee o escribe el mailbox de otro). `docs/security.md` establece
que las keys **son** identidad.

## Decisiones

- Nombrar las tools `cardinal_agent_send` / `cardinal_agent_inbox` (prefijo
  `cardinal_` como board y memory). La spec v2 lista `agent_send` / `agent_inbox`
  sin prefijo; el wire name alineado al resto del MCP surface gana.
- Overwrite de `from_agent` (no 403) para que un cliente MCP que ya manda
  `from_agent=identity.agent` siga recibiendo 200. La identidad efectiva es
  siempre la de la key.
- Forzar inbox al agente de la key (ignorar query spoofeado) en vez de 403. El
  agente ve su correo; no hay señal de “intentaste el de otro”.
- Mark-read: 404 si el mensaje no existe; 403 si existe pero pertenece a otro
  mailbox. Distingue “no está” de “no es tuyo” sin filtrar IDs inexistentes.
- No hay tool MCP de mark-read: la spec v2 solo pide send/inbox.
- Dual-auth de `/api/tasks` no cambia su modelo de identidad en este slice (fuera
  de scope). Binding de identidad del board: [`2026-09-06-task-identity-rag-vault-scope.md`](./2026-09-06-task-identity-rag-vault-scope.md).

## Alternativas consideradas

- **Solo dual-auth sin binding de identidad:** rechazado. Cualquier key activa
  leería o escribiría mailboxes ajenos (IDOR). Contradice “keys son identidad”.
- **403 cuando `from_agent` no coincide con la key:** peor UX. Clientes MCP que
  reenvían `identity.agent` fallarían; overwrite es fail-closed en identidad y
  sigue siendo 200.

## Archivos

- Modificados: `backend/src/server.ts`, `backend/src/api/messages.ts`,
  `backend/src/server.test.ts`, `packages/mcp/src/server.ts`,
  `packages/mcp/src/server.test.ts`, `README.md`, `package.json` (0.2.4).
- Docs: `docs/features/2026-08-31-mcp-mailbox-tools.md`,
  `docs/features/2026-08-31-mcp-board-tools.md` (out of scope),
  `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`,
  `docs/roadmap.md`, `docs/roadmap/fase-2.md`, `AGENTS.md`.

## Verificación

- Padre: `bun test --timeout 30000 packages/mcp/src backend/src` → **185 pass /
  0 fail**.
