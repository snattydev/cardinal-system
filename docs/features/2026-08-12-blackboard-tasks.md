# Blackboard Tasks — tabla + CRUD (2026-08-12)

Primer feature del pilar "Blackboard" de Cardinal v2.

## Qué se hizo

Tabla `tasks` + repos + handlers + rutas JWT para coordinación cross-provider
entre agentes. Modelo tipo Linear/equipo: tasks con status, assignee, árbol
padre/hijo, summary acotado y artifact_ref (puntero al resultado, nunca la prosa
completa).

## Por qué

Validado en spike 001 (`spikes/001-blackboard-no-inflacion/`): dos agentes de
proveedores distintos (Hermes + opencode vía herdr) coordinaron un objetivo en
común por un board estructurado sin inflar contexto ni tocar memoria. La regla de
oro es "pull + refs": el estado vive en filas de DB, los agentes consultan lo que
necesitan y cruzan pointers, no transcripts.

## Decisiones

- `tasks` como tabla nueva (migration append, no toca las existentes).
- id = `crypto.randomUUID()`.
- status CHECK: `open | claimed | done | blocked`.
- `claim` solo desde `open` → 409 `{error: "not_open"}` si no. Evita doble claim
  (lección de dedup de Nogal Hive).
- `complete` sin restricción de status previo; body vacío = `{summary: null,
  artifact_ref: null}` (un agente puede completar sin resumen).
- `created_by` default `"system"` (keys dinámicas / one-shot), overridable.
- Rutas `/api/tasks/:id/claim` y `/api/tasks/:id/complete` matcheadas ANTES del
  genérico `/api/tasks/:id` para no comerse el sufijo.

## Alternativas consideradas

- **Endpoint único `/api/tasks/:id` con PATCH** (estado en body): descartado,
  acciones explícitas (`claim`/`complete`) son más claras y menos ambiguas.
- **Cola de mensajes (mailbox) en el mismo feature**: pospuesto. El board es el
  primitivo de coordinación; el mailbox directo (agent_send/inbox) es otro feature
  cuando haga falta handoff directo.

## Archivos

- Creados: `backend/src/api/tasks.ts`, `backend/src/api/tasks.test.ts`
- Modificados: `backend/src/server.ts`, `packages/core/src/types.ts`,
  `packages/core/src/index.ts`, `packages/db/src/schema.ts`,
  `packages/db/src/repos.ts`, `packages/db/src/index.ts`, `packages/db/src/db.test.ts`

## Verificación

- `podman exec cardinal-backend sh -c 'cd /app && bun test'` → 213 pass / 0 fail
  (suite completa, no solo los nuevos tests).
- Implementado por cursor-agent vía herdr; verificado por el orquestador en 3
  capas (tests, diff, revisión de código).
- Desvíos del brief (justificados): re-export en `db/index.ts`, update del count
  de tablas (11→12) en `db.test.ts`.

## Pendiente (fuera de este feature)

- Exponer tasks como MCP tools (spike-002).
- Mailbox (`messages`) para handoff directo.
- WS broadcast de cambios en el board a dashboards suscritos.
