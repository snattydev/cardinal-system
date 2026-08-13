# Spike 001 — blackboard-no-inflación

> Estado: VALIDATED (2026-08-12)

## Question

Dado un tablero de tareas estructurado (blackboard) compartido entre dos agentes
de proveedores distintos, cuando el agente A postea un resultado y el agente B lo
retoma, entonces **ninguno infla su contexto ni escribe memoria**: el estado queda
en la tabla `tasks`, no en los transcripts ni en el perfil del humano.

## Approach

- Store compartido SQLite (`board.py`, stdlib puro, sin deps) con `tasks`
  (id, goal, status open|claimed|done|blocked, assigned_to, created_by, parent_id,
  summary acotado, artifact_ref, timestamps).
- `mcp_server.py`: server MCP stdio mínimo (JSON-RPC 2.0 newline-delimited) que
  expone `task_create/list/claim/complete` — el *shape* de la MCP surface real del
  Cardinal.
- `mcp_client.py`: client de test que valida el handshake y el mutate del store.
- Demo real: **researcher = Hermes**, **writer = opencode** (levantado vía herdr,
  pane `w4:p9`). Coordinan un objetivo común (release notes de Cardinal v0.2.0) solo
  a través del board.

## Demo

Objetivo en común = árbol de tasks:

```
942e2baa98e9  Release notes para Cardinal v0.2.0        open   (raíz)
├─ be83473ae1a6  Recopilar features de Fase 1 (0.2.0)   done   researcher → facts.md
└─ ec51a52e7772  Redactar release-note.md desde facts   done   writer → release-note.md
```

1. Researcher (Hermes) crea el árbol, claim + completa su subtask dejando el
   artifact `artifacts/facts.md` y un `summary` de UNA línea.
2. Writer (opencode) recibe vía herdr un prompt autocontenido de 6 pasos: lista el
   board, encuentra la task `open`, la claim, lee `facts.md`, escribe
   `release-note.md`, y completa con summary + artifact ref.
3. opencode lo ejecutó de punta a punta (con aprobación humana de permisos por
   comando vía `herdr agent send-keys`).

## Evidence

- Board final: subtask B `status=done, assigned_to=writer, artifact_ref=artifacts/release-note.md`.
- `release-note.md` (970 bytes) refleja fielmente `facts.md`: features + fixes +
  versión, en español, sin alucinar.
- opencode terminó en `idle`.

## Anti-inflation verification

- **Canal separado:** la coordinación vivió en `board.db` (SQLite aparte), NO en el
  chat de Hermes ni en el transcript de opencode. Cero interacción con el memory
  mirror o el perfil de user.
- **Pull, no push:** el writer solo recibió su prompt (6 pasos) + el artifact
  `facts.md` (~1 KB). No recibió el brainstorm completo ni el contexto del researcher
  (miles de bytes de docs/roadmap/git log).
- **Resultados como refs:** lo que cruza la frontera son pointers (`artifact_ref`)
  y summaries de una línea, no prosa completa. Board = 3 filas, cada goal/summary
  de una línea.
- **Memoria intacta:** ninguna escritura a memoria de Hermes; el board es su propio
  store, independiente de `state.db` y del perfil.

## Pitfalls / findings

- **Notificaciones MCP no tienen respuesta.** El client se colgó porque leía una
  respuesta para `notifications/initialized` (que no responde). Fix: no leer cuando
  el mensaje no tiene `id`. Esto NO fue un bug del protocolo — fue mi client.
- **Buffering en MCP stdio spawneado como subprocess.** Un server MCP lanzado por un
  client real tiene stdout a un pipe (block-buffered). El `flush()` explícito en el
  server alcanzó, pero lanzar con `-u` + `bufsize=1` es más robusto. Vale para
  spike-002 (el client MCP real del Cardinal spawnea igual).
- **opencode pide permisos por comando shell.** En el loop humano→agente vía herdr,
  cada comando nuevo requirió `Allow once` (approve por `herdr agent send-keys enter`).
  Esperado: es el human-in-the-loop. Un agente desatendido (cron/one-shot) necesita
  permisos pre-aprobados, no `Allow once` a mano.
- **opencode usó heredoc para escribir el archivo** (`cat > f << 'EOF'`). Funcionó,
  pero para la build real conviene que el board acepte el artifact como contenido o
  path, no depender de cómo el agente elige escribir.

## Recommendation for the real build

1. El modelo blackboard + pull + refs ES la forma limpia de coordinación cross-provider.
   Confirmado que no infla contexto ni memoria.
2. Implementar el board como tabla `tasks` + `messages` en el backend Bun del
   Cardinal (bun:sqlite), expuesto por MCP tools (spike-002 valida interop MCP real
   + multi-vault).
3. herdr queda como capa de hosting/local: descubrir agentes, promptear, aprobar
   permisos. El Cardinal nunca spawnea.
4. La MCP surface real debe manejar el caso "notificación sin respuesta" y el
   buffering del server stdio desde el día uno.

## Nota de higiene

`board.db` (binario) y `artifacts/` son evidencia del spike — no commitear el `.db`.
