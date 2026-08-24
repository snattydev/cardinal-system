# Task Board WS Broadcast (2026-08-17)

Broadcast en tiempo real de cambios del blackboard a dashboards suscritos.

## Qué se hizo

Cuando una task se crea, se claima o se completa vía REST, el backend emite un
evento `task_update` por WebSocket a todos los dashboards suscritos. El payload
lleva la task en camelCase (espejo de `agent_update`/`roster`).

## Por qué

El board es el primitivo de coordinación cross-provider de Cardinal v2 (pilar 3).
Para que el dashboard lo muestre en vivo —un agente crea una task y aparece al
instante, otro la claima y se refleja— hace falta push, no polling. Sin esto el
board quedaría ciego hasta recargar.

## Decisiones

- `taskToPayload` espeja `agentToPayload`: snake_case (DB) → camelCase (wire),
  consistente con el resto del canal WS.
- `broadcastTask(task)` público en el `Hub`, mismo patrón que
  `broadcastAgent`/`broadcastDevices`: itera `this.dashboards` suscritos.
- Los handlers `create/claim/complete` reciben un `onChange?: (task: TaskRow) =>
  void` opcional en vez de acoplarse al Hub. Se mantienen puros y testeables; el
  server inyecta `hub.broadcastTask` como callback.
- `onChange` se invoca SOLO tras un cambio exitoso. Un claim de task no-open
  devuelve 409 y NO emite broadcast (no hubo cambio).

## Alternativas consideradas

- **Acoplar los handlers al Hub directamente**: descartado — rompe la pureza de
  los handlers y complica el test unitario (habría que mockear el WS).
- **Que el server inspeccione la Response HTTP y re-parsee la task**: frágil,
  hacer JSON.parse de vuelta para extraer lo que el handler ya tiene.

## Archivos

- Modificados: `packages/ws/src/hub.ts`, `packages/ws/src/index.ts`,
  `backend/src/api/tasks.ts`, `backend/src/server.ts`,
  `packages/ws/src/hub.test.ts`, `backend/src/api/tasks.test.ts`

## Verificación

- `bun test` → 225 pass / 0 fail (7 tests nuevos: 3 en hub + 4 en tasks).
- Typecheck: el código de esta feature typecheckea limpio. El script
  `bun run typecheck` falla por un error PRE-EXISTENTE (`maxPayloadLength` en
  `server.ts:33` no reconocido por `bun-types`), ajeno a esta feature y pendiente
  de resolver por separado.

## Pendiente (fuera de este feature)

- Consumir `task_update` en el frontend (UI del board).
- Mailbox (`messages`) para handoff directo.
- Exponer tasks como MCP tools (spike-002).
