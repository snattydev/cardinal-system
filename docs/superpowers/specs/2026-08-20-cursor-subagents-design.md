# Cursor Subagents — Design

> Fecha: 2026-08-20
> Estado: Diseño validado. Plan: docs/superpowers/plans/2026-08-20-cursor-subagents.md
> Superficie: **Cursor es la interfaz de desarrollo ahora.** Los roles son agnósticos (cualquier runtime podría consumirlos). Los adapters nuevos son Cursor-only.

Relación: reemplaza la división “Cursor = planning visual / OpenCode = implementación” de [`2026-07-31-opencode-multi-agent-design.md`](./2026-07-31-opencode-multi-agent-design.md). OpenCode CLI sigue existiendo; no se expande su swarm en este corte. SOULs (`docs/agents/*-soul.md`) y prompts one-shot de PR **no se tocan**.

---

## 1. Objetivo

Que el agente padre de Cursor (Composer) pueda **delegar desde adentro** el trabajo de Cardinal System: subagentes in-session para especialistas, y Herdr para otras instancias de Cursor u otros kinds, sin que el producto Cardinal spawnee agentes.

**Éxito:**

- El padre implementa solo cambios de 1–2 archivos sin lógica crítica (igual que `AGENTS.md`).
- TDD, auth/keys/ws/db/router, multi-archivo, review, docs de feature y verificación van a un subagente nombrado.
- Tras un “listo”, `verifier` corre evidencia (`bun test` / `bun run build`) y puede fallar el claim.
- Si no hay `HERDR_ENV=1`, el trabajo sigue in-session y el dispatcher lo declara; no inspecciona Herdr desde afuera.
- Un cambio de política de rol se edita en un solo doc canónico.

**Fuera de alcance:**

- SOULs y nombres de agentes del producto Cardinal.
- Spawns desde el backend/blackboard (regla dura de v2: Cardinal no le dice a Herdr “levantá un agente”).
- Nuevos agentes OpenCode (`ws-protocol`, `frontend`, `verifier`, `security-reviewer`, `herdr-dispatcher` no se duplican en `.opencode/`).
- Skills Hermes nuevas, MCP nuevo, cambios de código de aplicación.

---

## 2. Principios

1. **Roles agnósticos, adapters de runtime.** `docs/agents/roles/` describe *qué hace* el rol (misión, routing, output, límites) sin tools de Cursor ni de OpenCode. `.cursor/agents/` es el adapter: frontmatter + reglas no negociables + “leé el role doc primero”.
2. **Cursor es la superficie real de desarrollo** en este momento. `AGENTS.md` y `.cursor/rules/cardinal.mdc` lo dicen en claro. OpenCode queda como swarm CLI legado: los 5 agentes existentes pueden apuntar al mismo role doc (un párrafo) para no divergir; no son el camino diario.
3. **Un rol = una responsabilidad.** No hay agente “helper”.
4. **Herdr es manos, no cerebro.** Solo `herdr-dispatcher` habla con Herdr. El padre decide *cuándo*; el dispatcher ejecuta split/start/prompt/wait.
5. **Read-only para quien no debe mutar:** `reviewer`, `security-reviewer`, `verifier`.

---

## 3. Roster y routing

El padre (Composer) **no es un orchestrator estricto**: hace el trabajo chico él mismo. Delega siempre si toca **auth / keys / ws / db / router**, es multi-archivo, pide review, docs de feature, verificación, o hace falta otro pane/kind.

| Agente | Entra cuando | No entra cuando | Mutación |
|--------|----------------|-----------------|----------|
| `builder` | Implementar spec en `packages/` (salvo `ws/`), `backend/`, GREEN de tests | El trabajo es sobre todo protocolo WS o UI | escribe código |
| `ws-protocol` | `packages/ws/**`, state machine, ping/pong, parseo de mensajes | UI o handlers HTTP que solo *usan* el hub | escribe código |
| `frontend` | `frontend/**`, types 1:1 con JSON del backend, cliente WS a `ws://127.0.0.1:8787` | Cambiar el protocolo o el backend | escribe código |
| `tester` | TDD: escribe `*.test.ts` RED **antes** del código | Verificar algo ya “terminado” | solo `*.test.ts` |
| `verifier` | Alguien dijo “listo”: corre tests/build, no cree claims | Escribir tests o arreglar código | `readonly` |
| `reviewer` | Calidad, claridad, tests, convenciones (`AGENTS.md`) | Security (eso es el otro) | `readonly` |
| `security-reviewer` | auth, keys, ws, leaks, inyección, endpoints sin auth | Estilo o naming | `readonly` |
| `docs` | Feature/fix ya verificado → `docs/features/<fecha>-<nombre>.md` | Durante la implementación | solo `docs/**` |
| `herdr-dispatcher` | Implementación larga, TDD paralelo, aislamiento, otro Cursor/OpenCode/kind | Sin `HERDR_ENV=1` → fallback in-session y lo declara | no implementa; controla panes |

### Anti-pisado

- Feature backend + UI: el padre lanza `builder` o `ws-protocol` **y** `frontend` en paralelo.
- TDD obligatorio: `tester` RED → `builder` o `ws-protocol` GREEN → `verifier`. Nunca al revés.
- Review de auth/keys/ws/protocolo: `reviewer` ∥ `security-reviewer`, ambos read-only.
- `herdr-dispatcher` no escribe producto. Nombres de agente Herdr: `[a-z][a-z0-9_-]{0,31}`, únicos (ej. `card-builder`).
- `verifier` no parchea. FAIL → el padre re-delega a `builder`/`tester`/`frontend`. No marca la feature completa.
- `readonly` en Cursor = sin edits ni shell que mute estado. `bun test` / `bun run build` / `git diff` están permitidos.

### Built-ins de Cursor

No redefinir `explore`, `bash` ni `browser`. Los 9 de arriba son *además* de esos.

---

## 4. Capas de archivos

```
docs/agents/roles/
  builder.md
  tester.md
  verifier.md
  reviewer.md
  security-reviewer.md
  docs.md
  ws-protocol.md
  frontend.md
  herdr-dispatcher.md

.cursor/agents/          # adapters Cursor (mismos 9 nombres)
  <rol>.md

.cursor/rules/cardinal.mdc   # update: Cursor = interfaz de orquestación
AGENTS.md                    # update: tabla Cursor subagents; OpenCode = CLI legado
.opencode/agents/*.md        # opcional, mínimo: un párrafo apuntando al role doc
```

### Role doc (canónico)

Cada archivo en `docs/agents/roles/`:

- Título y una línea de misión.
- `<!-- REGION: when -->` cuándo sí / cuándo no.
- `<!-- REGION: rules -->` reglas de Cardinal relevantes al rol (stack, TDD, types 1:1, leaks, Podman).
- `<!-- REGION: output -->` contrato de vuelta (tabla de la sección 6).
- Sin YAML de tools, sin `Task`, sin paths de `.cursor/`. Agnóstico.

`security-reviewer` **referencia** `docs/agents/prompts/security-review-checklist.md` (no lo reescribe). `reviewer` referencia el espíritu de `docs/agents/prompts/standard-review.md` (CRITICAL/HIGH/LOW) sin inyectar variables de PR one-shot.

### Adapter Cursor

Frontmatter:

| Campo | Valor |
|-------|--------|
| `name` | igual al filename, kebab-case |
| `description` | WHAT + WHEN, en inglés (Task tool hints). Frases `use proactively` / `always use for` en `tester`, `verifier`, `security-reviewer` |
| `model` | `inherit` en todos |
| `readonly` | `true` en `reviewer`, `security-reviewer`, `verifier` |
| `is_background` | `false` en todos, incluido `herdr-dispatcher` (el padre espera el handoff). Para trabajo paralelo el padre lanza **varios** dispatchers en un mismo turno; no hace falta `is_background: true` |

Cuerpo: ≤ ~80 líneas, **en español** (igual que el resto de `docs/agents/`). Primer paso obligatorio: leer `docs/agents/roles/<rol>.md`. Incluir las 5–8 reglas que no pueden faltar si el read falla (ej. tester: solo `*.test.ts`; builder: no extras; verifier: no fixes).

Role docs: español. Campo `description` del adapter: **inglés** (hints del Task tool).

### Padre (rule + AGENTS.md)

`.cursor/rules/cardinal.mdc` deja de decir que Cursor es solo planning visual. Pasa a:

- Cursor Composer = padre: delegación por tamaño; tabla de los 9; Herdr solo vía `herdr-dispatcher`.
- Stack, TDD, branching, leaks: se mantienen.

`AGENTS.md`:

- Sección Cursor: superficie de desarrollo + invocación `/builder`, `/verifier`, etc.
- OpenCode: swarm CLI disponible, no el camino diario.
- No nombrar SOULs ni identidades.

---

## 5. Flujo

```
pedido / spec
  → ¿1–2 archivos, no TDD-crítico? padre implementa
  → si no:
       tester (RED)
       [herdr-dispatcher si largo, paralelo o otro kind]
       ws-protocol | frontend | builder según path
  → implementación GREEN
  → verifier (bloquea claims rotos)
  → reviewer ∥ security-reviewer (si toca auth/keys/ws/protocolo)
  → docs
  → padre sugiere commit (no commitea salvo pedido explícito)
```

Invocación: automática por `description`, o explícita (`/verifier …`, “usá el subagente frontend”).

---

## 6. Herdr

Solo aplica dentro de un pane con `HERDR_ENV=1`. Skill de referencia: `herdr` (no copiar el CLI entero al role doc; el dispatcher **lee la skill**).

1. Check `HERDR_ENV`. Si falla: mensaje “no estoy en Herdr”, el padre cae a subagentes in-session. No corre `herdr *`.
2. Split hermano: `--no-focus`, `--cwd "$PWD"`. Dirección: `right` si el pane es ancho, `down` si es alto.
3. `herdr agent start <name> --kind <kind> --pane <id>`. Kind: el que pida el padre/usuario. El dispatcher descubre kinds válidos con `herdr agent` (help del CLI); **no inventa slugs**. Si no hay kind, pregunta o usa el kind del pane llamador si Herdr lo reporta.
4. Prompt **autocontenido** (spec, paths, definition of done). El remoto no ve el chat del padre.
5. `agent prompt … --wait`. Si `blocked`: reportar; no aprobar permisos salvo que el humano ya lo haya autorizado en esa sesión.
6. Leer resultado (`agent read` / fallback a archivo que el remoto haya escrito). Devolver IDs + resumen al padre.
7. No cerrar panes/tabs/workspaces que no creó. Nunca `herdr server stop`.

Esto es **Cursor-como-interfaz**, no el producto Cardinal. Compatible con la regla v2 “Cardinal NUNCA le dice a herdr levantá un agente”.

---

## 7. Contrato de output

El último mensaje al padre es estructurado. Sin logs crudos.

| Agente | Devuelve |
|--------|----------|
| `tester` | paths de test, RED o GREEN, qué falta implementar |
| `builder` / `ws-protocol` / `frontend` | files touched, comando de verify y resultado, desviaciones vs spec (si hubo, deben ser cero salvo bloqueo) |
| `verifier` | qué se corrió; passed; claimed-but-broken; gaps. Verdict: `PASS` o `FAIL` |
| `reviewer` | `CRITICAL` / `HIGH` / `LOW` (sección vacía explícita si no hay) |
| `security-reviewer` | igual + vector y `archivo:línea`. Solo findings confirmados |
| `docs` | path del feature doc |
| `herdr-dispatcher` | `pane_id`, agent name, kind, resumen o error de fallback |

Errores de orquestación:

- Subagente que no leyó el role doc → el padre re-lanza con el path explícito.
- Tests rojos de un implementer → no se llama a `docs`.
- `verifier` FAIL → re-delegar, no “completar”.

---

## 8. Relación con OpenCode

| Qué | Este corte |
|-----|------------|
| `.cursor/agents/` (9) | **In scope** — superficie de desarrollo |
| `docs/agents/roles/` (9) | **In scope** — canónico agnóstico |
| `.opencode/agents/` existentes | Opcional: un párrafo “seguí `docs/agents/roles/<rol>.md`”. Sin agentes nuevos |
| Comandos `/feature` `/test` `/review` | Sin cambios |
| SOULs | **No tocar** |

---

## 9. Decisiones de brainstorm (cerradas)

| Tema | Elección |
|------|----------|
| Slicing | Híbrido: roles de proceso + especialistas |
| Herdr vs in-session | Por tipo de trabajo (review/docs/security in-session; impl larga / TDD paralelo / aislamiento → Herdr) |
| Roster | 8 + `verifier` (9) |
| Padre | Delegación por tamaño (no orchestrator estricto) |
| Prompts | Compartidos en `docs/agents/roles/`; adapters por runtime |
| Empaquetado | Capas (role doc + adapter corto + rule del padre) |
| Identidades | SOULs ajenas; solo roles |

---

## 10. Verificación (cuando se implemente)

No hay tests automatizados de markdown de agentes. Criterio:

- Existen los 9 role docs y los 9 adapters; frontmatter válido (`name`, `description`, `readonly`/`is_background` según tabla).
- `AGENTS.md` y `cardinal.mdc` describen Cursor como interfaz de desarrollo y listan los 9.
- Ningún diff en `docs/agents/*-soul.md`.
- Un dry-run mental: pedido “fix JWT expiry” → padre no lo implementa solo → `tester` + `builder` + `verifier` + `security-reviewer` ∥ `reviewer`.
- Pedido “cambiar padding del AgentCard” → padre o `frontend`, sin TDD ni Herdr.

---

*Implementación: ver el plan.*
