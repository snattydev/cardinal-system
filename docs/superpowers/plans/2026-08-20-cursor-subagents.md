# Cursor Subagents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship nine Cursor subagents plus canonical agent-agnostic role docs so Composer can delegate Cardinal development from inside Cursor (in-session specialists + Herdr for other instances/kinds).

**Architecture:** Layered. `docs/agents/roles/<rol>.md` is the runtime-agnostic source of truth (misión, when, rules, output). `.cursor/agents/<rol>.md` is the Cursor adapter (YAML routing + short Spanish prompt that must read the role doc first). The Composer parent is wired via `AGENTS.md` and `.cursor/rules/cardinal.mdc`. OpenCode is not expanded; existing agents get a one-paragraph pointer.

**Tech Stack:** Cursor custom subagents (`.cursor/agents/*.md`), Markdown + BMAD-lite regions, existing `scripts/verify-dev-setup.sh`. No application code, no new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-cursor-subagents-design.md` — follow it; do not invent extra agents.
- Role docs are **agent-agnostic**: no `Task` tool, no `.cursor/` paths, no OpenCode frontmatter. Spanish. Regions: `when`, `rules`, `output`.
- Cursor adapters: `model: inherit`, `is_background: false` on all nine. `readonly: true` only on `reviewer`, `security-reviewer`, `verifier`. `description` in **English**. Body in **Spanish**, ≤ ~80 lines.
- Cursor is the current development surface. Do not add OpenCode agents named `ws-protocol`, `frontend`, `verifier`, `security-reviewer`, or `herdr-dispatcher`.
- Do not modify `docs/agents/kirito-soul.md`, `docs/agents/agil-soul.md`, `docs/agents/lisbeth-soul.md`, or `docs/agents/prompts/*`.
- Cardinal the product does not spawn Herdr agents. Only `herdr-dispatcher` talks to Herdr, and only when `HERDR_ENV=1`.
- Docs/config work: no TDD. Verify with file checks + `bash scripts/verify-dev-setup.sh`.
- Commits: Conventional Commits, subject English ≤72 chars, body Spanish. Do not commit unless the user asked to execute this plan (this file still lists commit steps for the executor).

---

## File map

| Path | Role |
|------|------|
| `docs/agents/roles/{builder,tester,docs,reviewer,security-reviewer,verifier,ws-protocol,frontend,herdr-dispatcher}.md` | Canonical role (create) |
| `.cursor/agents/<same 9>.md` | Cursor adapters (create) |
| `AGENTS.md` | Parent routing + Cursor as daily surface (modify) |
| `.cursor/rules/cardinal.mdc` | Parent rule (modify) |
| `.opencode/agents/{builder,tester,reviewer,docs,orchestrator}.md` | One pointer paragraph (modify) |
| `scripts/verify-dev-setup.sh` | Check `.cursor/agents/` (modify) |
| `docs/features/2026-08-20-cursor-subagents.md` | Feature doc (create) |
| `docs/superpowers/specs/2026-08-20-cursor-subagents-design.md` | Status line (modify) |

---

### Task 1: Canonical process roles (`builder`, `tester`, `docs`)

**Files:**
- Create: `docs/agents/roles/builder.md`
- Create: `docs/agents/roles/tester.md`
- Create: `docs/agents/roles/docs.md`

**Interfaces:**
- Consumes: spec sections 3, 7
- Produces: role docs that adapters in Task 4 will tell the agent to read first

- [ ] **Step 1: Create `docs/agents/roles/builder.md`**

```markdown
# Builder

Implementás exactamente la spec. Sin funcionalidad extra ni “mejoras” no pedidas.

<!-- REGION: when -->
## Cuándo sí

- Implementar en `packages/` **excepto** `packages/ws/`, y en `backend/`.
- GREEN: hacer pasar tests que `tester` ya dejó en RED.
- Código de aplicación TypeScript/Bun que no es protocolo WS ni UI.

## Cuándo no

- El trabajo es sobre todo `packages/ws/**` → rol `ws-protocol`.
- El trabajo es sobre todo `frontend/**` → rol `frontend`.
- Escribir tests RED → rol `tester`.
- Verificar un “listo” → rol `verifier`.
- Documentar → rol `docs`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Stack: TypeScript + Bun (`Bun.serve`, `bun:sqlite`), WebSocket nativo, SQLite. Runtime containerizado (Podman); no instalar dependencias nativas en el host.
- Grafo de packages: dependencias solo hacia abajo (core → db → auth/keys → ws → backend). Nunca cíclicas.
- Ámbitos TDD (auth, keys, ws, db, router): no empieces implementación si no hay test RED. Si te asignan GREEN, los tests ya existen.
- Frontend types 1:1 con el JSON del backend no es tu zona; si el cambio cruza UI, otro rol lo toma en paralelo.
- Audit de leaks: no hardcodear `sk-cardinal-*`, tokens, paths absolutos, emails.
- No commitees salvo pedido explícito del humano.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con exactamente estas secciones:

    ## Files
    - path (created|modified)

    ## Verify
    comando + resultado (bun test del paquete tocado; bun run build si tocaste frontend)

    ## Spec deviations
    none

Si hubo un bloqueo que forzó desviación, listala; si no, `none`.
<!-- ENDREGION: output -->
```

- [ ] **Step 2: Create `docs/agents/roles/tester.md`**

```markdown
# Tester

Escribís tests primero. TDD estricto: RED antes de cualquier implementación.

<!-- REGION: when -->
## Cuándo sí

- Ámbitos TDD obligatorio: auth (JWT, expiración, login), keys (generación, hash SHA-256, revocación), protocolo WS (parseo, state machine, ping/pong), db (migraciones, integridad), router (fallback chain, rate limiting, budget).
- Crear o extender `*.test.ts` **antes** del código de producción.

## Cuándo no

- Verificar trabajo ya reclamado como listo → rol `verifier`.
- Implementar producción para poner tests en GREEN → `builder` o `ws-protocol`.
- Frontend: no hay TDD unitario obligatorio; la verificación es `bun run build`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- El test debe FALLAR antes de la implementación (RED). Corré `bun test` y confirmá el fallo.
- Tests junto al fuente: `*.test.ts`. Solo esos archivos se escriben.
- No implementes el código de producción. Reportá qué falta para GREEN.
- Usá `bun test` (path del paquete si aplica).
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con exactamente estas secciones:

    ## Tests
    - path/to/foo.test.ts

    ## Result
    RED | GREEN

    ## Missing implementation
    qué tiene que hacer el implementer para GREEN
<!-- ENDREGION: output -->
```

- [ ] **Step 3: Create `docs/agents/roles/docs.md`**

```markdown
# Docs

Documentás features y fixes ya verificados.

<!-- REGION: when -->
## Cuándo sí

- Feature, fix o patch **después** de que `verifier` (o el padre) confirmó evidencia.
- Archivo: `docs/features/<YYYY-MM-DD>-<nombre>.md`.

## Cuándo no

- Durante la implementación.
- Bumps de versión o cambios triviales de una línea.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- El doc incluye: **qué se hizo, por qué, decisiones, alternativas consideradas, archivos creados/modificados**.
- No toques SOULs (`docs/agents/*-soul.md`) ni prompts one-shot de PR.
- Docs de agentes pueden usar BMAD-lite: `<!-- REGION: name -->` / `<!-- ENDREGION: name -->`.
- Solo escribí bajo `docs/**` (y `README.md` si el cambio lo exige). No toques código de aplicación.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

    ## Doc
    docs/features/<fecha>-<nombre>.md
<!-- ENDREGION: output -->
```

- [ ] **Step 4: Verify the three files exist and have the three regions**

Run:

```bash
for r in builder tester docs; do
  f="docs/agents/roles/$r.md"
  test -f "$f" || { echo "missing $f"; exit 1; }
  grep -q 'REGION: when' "$f" && grep -q 'REGION: rules' "$f" && grep -q 'REGION: output' "$f" || { echo "regions missing in $f"; exit 1; }
done
echo OK
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add docs/agents/roles/builder.md docs/agents/roles/tester.md docs/agents/roles/docs.md
git commit -m "$(cat <<'EOF'
docs(agents): add canonical builder, tester, and docs roles

Roles agnósticos en docs/agents/roles/ para que Cursor (y otros runtimes) compartan misión, routing y contrato de output.
EOF
)"
```

---

### Task 2: Canonical review roles (`reviewer`, `security-reviewer`, `verifier`)

**Files:**
- Create: `docs/agents/roles/reviewer.md`
- Create: `docs/agents/roles/security-reviewer.md`
- Create: `docs/agents/roles/verifier.md`

**Interfaces:**
- Consumes: spec sections 3, 7; `docs/agents/prompts/standard-review.md` (espíritu, no copiar el template de PR); `docs/agents/prompts/security-review-checklist.md` (referencia, no reescribir)
- Produces: read-only role docs

- [ ] **Step 1: Create `docs/agents/roles/reviewer.md`**

```markdown
# Reviewer

Code review de calidad. No modificás archivos.

<!-- REGION: when -->
## Cuándo sí

- Diff de feature/fix: claridad, mantenibilidad, convenciones de `AGENTS.md`, tests (happy path y edges), naming, simplicidad.

## Cuándo no

- Vulnerabilidades, leaks, auth, inyección → rol `security-reviewer` (lanzar en paralelo si el diff toca auth/keys/ws/protocolo).
- Arquitectura de producto / elección de stack.
- Implementar fixes.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Read-only. `bun test` / `git diff` / `git log` están bien; no edits ni shell que mute estado.
- Alineado al espíritu de `docs/agents/prompts/standard-review.md` (calidad, no security). No uses las variables de PR one-shot (`{pr_diff}`, etc.) salvo que el padre te las pase.
- No reescribas el checklist de seguridad.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

    CRITICAL:
    (none) | items que bloquean — bugs, rotura de build

    HIGH:
    (none) | debería arreglarse antes de merge

    LOW:
    (none) | sugerencias

Cada sección vacía debe decir `(none)` explícito.
<!-- ENDREGION: output -->
```

- [ ] **Step 2: Create `docs/agents/roles/security-reviewer.md`**

```markdown
# Security Reviewer

Revisión de seguridad. No modificás archivos. Solo findings confirmados.

<!-- REGION: when -->
## Cuándo sí

- Diff que toca auth, keys, ws, protocolo, cookies, JWT, endpoints, input de usuario.
- Sospecha de leaks (`sk-cardinal-*`, tokens, secrets, paths absolutos, emails).

## Cuándo no

- Estilo, naming, claridad → rol `reviewer`.
- Pentest ofensivo / exploits.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Read-only. Evaluá el diff contra `docs/agents/prompts/security-review-checklist.md` (no lo copies ni lo reescribas). Ítems N/A se omiten.
- No especules. Si no está confirmado, no lo reportes.
- `readonly` implica: sin edits; `git diff` y lectura de código sí.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

    CRITICAL:
    (none) | archivo:línea — vector — por qué

    HIGH:
    (none) | archivo:línea — vector

    LOW:
    (none) | archivo:línea

Cada finding lleva path:línea y vector en lenguaje claro.
<!-- ENDREGION: output -->
```

- [ ] **Step 3: Create `docs/agents/roles/verifier.md`**

```markdown
# Verifier

Validador escéptico. No creés claims. No parcheás código.

<!-- REGION: when -->
## Cuándo sí

- Alguien dijo que el trabajo está listo (padre, builder, frontend, ws-protocol).
- Antes de `docs` y antes de sugerir commit.

## Cuándo no

- Escribir tests nuevos → `tester`.
- Implementar o arreglar → `builder` / `ws-protocol` / `frontend`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Corré evidencia: `bun test` (ámbitos tocados o suite) y/o `bun run build` si hay frontend.
- Comprobá que los archivos reclamados existen y que los tests no son solo archivos vacíos.
- Read-only: sin edits ni shell que mute estado. Correr tests/build está permitido.
- Verdict `FAIL` si hay claimed-but-broken o tests rojos. El padre re-delega; no marques la feature completa.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

    ## Ran
    comandos ejecutados

    ## Passed
    - …

    ## Claimed but broken
    - … | (none)

    ## Gaps
    - … | (none)

    Verdict: PASS | FAIL
<!-- ENDREGION: output -->
```

- [ ] **Step 4: Verify files + that prompt sources were not modified**

Run:

```bash
for r in reviewer security-reviewer verifier; do
  f="docs/agents/roles/$r.md"
  test -f "$f" || { echo "missing $f"; exit 1; }
  grep -q 'REGION: when' "$f" || exit 1
done
git diff --stat -- docs/agents/kirito-soul.md docs/agents/agil-soul.md docs/agents/lisbeth-soul.md docs/agents/prompts/
echo OK
```

Expected: empty diffstat for souls/prompts, then `OK`.

- [ ] **Step 5: Commit**

```bash
git add docs/agents/roles/reviewer.md docs/agents/roles/security-reviewer.md docs/agents/roles/verifier.md
git commit -m "$(cat <<'EOF'
docs(agents): add reviewer, security-reviewer, and verifier roles

Separa calidad, seguridad y verificación de claims. Los tres son read-only y no tocan SOULs ni prompts one-shot.
EOF
)"
```

---

### Task 3: Canonical specialist roles (`ws-protocol`, `frontend`, `herdr-dispatcher`)

**Files:**
- Create: `docs/agents/roles/ws-protocol.md`
- Create: `docs/agents/roles/frontend.md`
- Create: `docs/agents/roles/herdr-dispatcher.md`

**Interfaces:**
- Consumes: spec sections 3, 6, 7
- Produces: specialist role docs; `herdr-dispatcher` remains multiplexer-agnostic in this file (no Cursor-only tool names)

- [ ] **Step 1: Create `docs/agents/roles/ws-protocol.md`**

```markdown
# WS Protocol

Implementás el protocolo WebSocket nativo en `packages/ws/`.

<!-- REGION: when -->
## Cuándo sí

- `packages/ws/**`: parseo de mensajes, state machine, ping/pong, timeouts, hub.
- TDD: este ámbito es obligatorio — GREEN sobre tests RED de `tester`.

## Cuándo no

- Handlers HTTP o composición en `backend/` que solo *usan* el hub → `builder`.
- Cliente React / dashboard → `frontend`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Stack: TypeScript + Bun, WebSocket nativo. No reinventar orquestación de agentes.
- Mismos constraints de builder: spec exacta, sin extras, Podman, no leaks.
- No escribas tests RED (eso es `tester`). No verifiques claims (eso es `verifier`).
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

    ## Files
    - path (created|modified)

    ## Verify
    comando + resultado

    ## Spec deviations
    none
<!-- ENDREGION: output -->
```

- [ ] **Step 2: Create `docs/agents/roles/frontend.md`**

```markdown
# Frontend

Implementás UI en `frontend/`. Types del cliente = JSON real del backend.

<!-- REGION: when -->
## Cuándo sí

- `frontend/**`: React, Vite, Tailwind v4, páginas, hooks, cliente WS del dashboard.

## Cuándo no

- Cambiar el protocolo en `packages/ws/` → `ws-protocol`.
- Cambiar handlers/API en `backend/` o `packages/` (salvo types compartidos que el padre coordine) → `builder`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Types 1:1 con el JSON del backend (flat fields, no nested). Mismatch = pantalla negra.
- El WS del frontend va a `ws://127.0.0.1:8787/ws`, **no** por el proxy de Vite.
- Dev URLs: frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:8787` (127.0.0.1, no localhost — cookies).
- No TDD unitario obligatorio. Verificación: `bun run build` (typecheck + Vite).
- Runtime containerizado; no instalar deps nativas en el host.
- No extras fuera de spec.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

    ## Files
    - path (created|modified)

    ## Verify
    bun run build (en frontend/) + resultado

    ## Spec deviations
    none
<!-- ENDREGION: output -->
```

- [ ] **Step 3: Create `docs/agents/roles/herdr-dispatcher.md`**

```markdown
# Herdr Dispatcher

Despachás trabajo a un pane hermano del multiplexer local. No implementás producto.

<!-- REGION: when -->
## Cuándo sí

- Implementación larga, TDD en paralelo, aislamiento, u otro kind de agente (otra instancia del IDE, CLI, etc.).
- El padre te da spec, paths y definition of done.

## Cuándo no

- Si el entorno no es un pane del multiplexer (`HERDR_ENV` distinto de `1`): declaralo y **no** hables con el CLI. El padre cae a subagentes in-session.
- Review, docs y seguridad van in-session, no a otro pane, salvo que el padre lo pida explícito.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Antes de cualquier comando: `test "${HERDR_ENV:-}" = 1`. Si falla: último mensaje = no estás en Herdr + fallback. No inspecciones la sesión desde afuera.
- Leé la skill/CLI del multiplexer (`herdr`) en el entorno; no copies el manual entero a tu respuesta.
- Split hermano: `--no-focus`, mismo cwd. `right` si el pane es ancho, `down` si es alto.
- Nombres de agente: `[a-z][a-z0-9_-]{0,31}`, únicos (ej. `card-builder`).
- Kind: el que pida el padre. Descubrí kinds válidos con el help del CLI; **no inventes slugs**. Si no hay kind, preguntá o usá el kind del pane llamador si el multiplexer lo reporta.
- Prompt al remoto **autocontenido** (spec, paths, DoD). El remoto no ve el chat del padre.
- `blocked`: reportá; no apruebes permisos salvo autorización explícita del humano en esa sesión.
- No cierres panes/tabs/workspaces que no creaste. Nunca `herdr server stop`.
- Esto es la interfaz humana/IDE, no el producto Cardinal. Cardinal no spawnea agentes.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

    ## Dispatch
    pane_id: …

    agent: …

    kind: …

    ## Result
    resumen del remoto

    ## Fallback
    (none) | not in Herdr — padre debe usar subagentes in-session
<!-- ENDREGION: output -->
```

- [ ] **Step 4: Verify nine role docs and agnostic constraint**

Run:

```bash
ls docs/agents/roles/*.md | wc -l
grep -R -n -E 'Task tool|\.cursor/agents|mode: subagent' docs/agents/roles && exit 1 || true
echo OK
```

Expected: `9` then `OK` (no matches).

- [ ] **Step 5: Commit**

```bash
git add docs/agents/roles/ws-protocol.md docs/agents/roles/frontend.md docs/agents/roles/herdr-dispatcher.md
git commit -m "$(cat <<'EOF'
docs(agents): add ws-protocol, frontend, and herdr-dispatcher roles

Especialistas de dominio más el dispatcher del multiplexer. El role doc de Herdr no implementa producto ni spawnea desde Cardinal.
EOF
)"
```

---

### Task 4: Cursor adapters (all nine)

**Files:**
- Create: `.cursor/agents/builder.md`
- Create: `.cursor/agents/tester.md`
- Create: `.cursor/agents/docs.md`
- Create: `.cursor/agents/reviewer.md`
- Create: `.cursor/agents/security-reviewer.md`
- Create: `.cursor/agents/verifier.md`
- Create: `.cursor/agents/ws-protocol.md`
- Create: `.cursor/agents/frontend.md`
- Create: `.cursor/agents/herdr-dispatcher.md`

**Interfaces:**
- Consumes: `docs/agents/roles/<rol>.md` from Tasks 1–3
- Produces: Cursor Task-tool subagents (`name` = filename)

Write each file exactly as below. First action in every body: read the role doc.

- [ ] **Step 1: Create `.cursor/agents/builder.md`**

```markdown
---
name: builder
description: Implements Cardinal System features in packages/ (except ws/) and backend/. Use when writing TypeScript/Bun code to spec after tests exist (GREEN). Do not use for packages/ws protocol or frontend UI.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/builder.md` y seguilo. Si el read falla, estas reglas no se negocian:

- Implementá exactamente la spec. Sin extras.
- No toques `packages/ws/**` ni `frontend/**` como zona primaria.
- TDD (auth/keys/ws/db/router): no GREEN sin test RED previo.
- Podman; no deps nativas. Sin leaks (`sk-cardinal-*`, tokens, paths, emails).
- Último mensaje: Files / Verify / Spec deviations.
```

- [ ] **Step 2: Create `.cursor/agents/tester.md`**

```markdown
---
name: tester
description: Writes failing tests first (TDD RED) for auth, keys, ws, db, and router. Use proactively when those packages change and tests do not exist yet. Do not use to verify claimed-complete work.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/tester.md` y seguilo. Si el read falla:

- Solo escribí `*.test.ts`. El test debe FALLAR (RED) antes del código de producción.
- No implementes producción. No verifiques un “listo” (eso es `verifier`).
- Corré `bun test`. Último mensaje: Tests / Result RED|GREEN / Missing implementation.
```

- [ ] **Step 3: Create `.cursor/agents/docs.md`**

```markdown
---
name: docs
description: Writes docs/features/ after work is verified. Use when documenting a completed Cardinal feature or fix. Do not use during implementation.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/docs.md` y seguilo. Si el read falla:

- Solo después de verificación. Path: `docs/features/<YYYY-MM-DD>-<nombre>.md`.
- Incluí qué, por qué, decisiones, alternativas, archivos.
- No toques SOULs ni código de aplicación. Último mensaje: path del doc.
```

- [ ] **Step 4: Create `.cursor/agents/reviewer.md`**

```markdown
---
name: reviewer
description: Standard code review for clarity, maintainability, conventions, and tests. Use when reviewing a Cardinal diff. Ignore security issues (use security-reviewer).
model: inherit
readonly: true
is_background: false
---

Leé `docs/agents/roles/reviewer.md` y seguilo. Si el read falla:

- Read-only. Calidad, no security.
- Output: CRITICAL / HIGH / LOW con `(none)` si vacío.
```

- [ ] **Step 5: Create `.cursor/agents/security-reviewer.md`**

```markdown
---
name: security-reviewer
description: Security review for auth, keys, ws, protocol, leaks, injection, and unauthenticated endpoints. Use proactively when those areas change. Confirmed findings only.
model: inherit
readonly: true
is_background: false
---

Leé `docs/agents/roles/security-reviewer.md` y el checklist `docs/agents/prompts/security-review-checklist.md`. Si el read falla:

- Read-only. Solo findings confirmados, con archivo:línea y vector.
- Output: CRITICAL / HIGH / LOW. Estilo/naming no es tu scope.
```

- [ ] **Step 6: Create `.cursor/agents/verifier.md`**

```markdown
---
name: verifier
description: Validates claimed-complete work by running bun test and/or bun run build. Use proactively after tasks are marked done. Never write or fix code.
model: inherit
readonly: true
is_background: false
---

Leé `docs/agents/roles/verifier.md` y seguilo. Si el read falla:

- No creas claims. Corré `bun test` y/o `bun run build`.
- No parchees. Verdict PASS o FAIL. FAIL → el padre re-delega.
- Output: Ran / Passed / Claimed but broken / Gaps / Verdict.
```

- [ ] **Step 7: Create `.cursor/agents/ws-protocol.md`**

```markdown
---
name: ws-protocol
description: Implements packages/ws WebSocket protocol, state machine, ping/pong, and message parsing. Use when the work is primarily the ws package. TDD required.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/ws-protocol.md` y seguilo. Si el read falla:

- Zona primaria: `packages/ws/**`. No UI, no HTTP que solo usa el hub.
- TDD: GREEN sobre RED de `tester`. Spec exacta, sin extras.
- Output: Files / Verify / Spec deviations.
```

- [ ] **Step 8: Create `.cursor/agents/frontend.md`**

```markdown
---
name: frontend
description: Implements frontend/ React Vite Tailwind. Types must match backend JSON 1:1. WS client uses ws://127.0.0.1:8787/ws not the Vite proxy. Use when the work is primarily UI.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/frontend.md` y seguilo. Si el read falla:

- Types 1:1 con JSON del backend (flat). WS a `ws://127.0.0.1:8787/ws`.
- Verify con `bun run build`. No TDD unitario obligatorio.
- Output: Files / Verify / Spec deviations.
```

- [ ] **Step 9: Create `.cursor/agents/herdr-dispatcher.md`**

```markdown
---
name: herdr-dispatcher
description: Dispatches work to a sibling Herdr pane (another Cursor instance or other agent kind). Use when implementation is long, TDD must run in parallel, isolation is needed, or another kind is required. Does not implement product code.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/herdr-dispatcher.md`. Si `HERDR_ENV=1`, leé y seguí la skill `herdr` del entorno. Si el read falla:

1. `test "${HERDR_ENV:-}" = 1` — si no, reportá fallback y pará. No corras `herdr`.
2. Split hermano `--no-focus` `--cwd "$PWD"`. Start + prompt autocontenido + wait.
3. No inventes kind slugs. No implementes producto. No cierres panes ajenos. Nunca `herdr server stop`.
4. Output: pane_id, agent, kind, Result o Fallback.
```

- [ ] **Step 10: Verify adapters**

Run:

```bash
set -euo pipefail
expected="builder tester docs reviewer security-reviewer verifier ws-protocol frontend herdr-dispatcher"
for r in $expected; do
  f=".cursor/agents/$r.md"
  test -f "$f"
  grep -q "^name: $r$" "$f"
  grep -q "^model: inherit$" "$f"
  grep -q "^is_background: false$" "$f"
  grep -q "docs/agents/roles/$r.md" "$f"
done
for r in reviewer security-reviewer verifier; do
  grep -q "^readonly: true$" ".cursor/agents/$r.md"
done
for r in builder tester docs ws-protocol frontend herdr-dispatcher; do
  grep -q "^readonly: false$" ".cursor/agents/$r.md"
done
test "$(ls .cursor/agents/*.md | wc -l)" -eq 9
echo OK
```

Expected: `OK`

- [ ] **Step 11: Commit**

```bash
git add .cursor/agents/*.md
git commit -m "$(cat <<'EOF'
feat(cursor): add nine specialized subagent adapters

Adapters en .cursor/agents/ con routing por description. El padre de Cursor puede delegar builder, tester, verifier, reviews, docs, ws, frontend y Herdr.
EOF
)"
```

---

### Task 5: Wire the Composer parent (`AGENTS.md` + `cardinal.mdc`)

**Files:**
- Modify: `AGENTS.md` (Swarm / Agent Roles / Delegation / Cursor Section / repo tree)
- Modify: `.cursor/rules/cardinal.mdc` (replace “Cuándo usar Cursor vs OpenCode”)

**Interfaces:**
- Consumes: the nine adapter names from Task 4
- Produces: parent instructions so Composer delegates by size

- [ ] **Step 1: In `AGENTS.md`, extend the repo tree**

Inside the `cardinal-system/` tree block, add `.cursor/` next to the other top-level entries and `roles/` under `docs/agents/`:

```
├── .cursor/
│   ├── agents/              subagentes Cursor (adapters)
│   └── rules/
```

Under `docs/agents/` add `│   │   └── roles/           roles canónicos (agnósticos)`.

- [ ] **Step 2: Replace the Swarm / Cursor sections at the bottom of `AGENTS.md`**

Delete from `## 🕸️ Swarm Workflow (OpenCode)` through the end of `## 🖥️ Cursor Section` (keep `## ⚙️ OpenCode Config Reference`). Insert:

```markdown
## 🕸️ Swarm Workflow

**Cursor es la superficie de desarrollo ahora.** Composer es el padre: implementa cambios de 1–2 archivos sin lógica crítica; delega el resto a subagentes en `.cursor/agents/`.

- TDD obligatorio (auth, keys, ws, db, router), multi-archivo, review, docs de feature, verificación, u otro pane/kind → delegar.
- Invocación: automática por `description`, o explícita (`/builder`, `/verifier`, “usá el subagente frontend”).
- Tras un “listo”, siempre `verifier` con evidencia (`bun test` / `bun run build`).
- Herdr (otra instancia de Cursor u otro kind) **solo** vía `herdr-dispatcher`, y solo si `HERDR_ENV=1`. Si no, in-session.
- OpenCode CLI (`.opencode/`) sigue disponible (`/feature`, `/test`, `/review`); no es el camino diario.

Flujo: tester RED → builder | ws-protocol | frontend GREEN → verifier → reviewer ∥ security-reviewer (si auth/keys/ws) → docs → el padre sugiere commit (no commitea salvo pedido).

## 🤖 Agent Roles (Cursor)

| Agente | Readonly | Rol |
|--------|----------|-----|
| `builder` | no | Implementa spec en `packages/` (salvo `ws/`) y `backend/` |
| `ws-protocol` | no | Protocolo en `packages/ws/` |
| `frontend` | no | `frontend/**`, types 1:1 con JSON, WS a `:8787` |
| `tester` | no | TDD RED en `*.test.ts` |
| `verifier` | sí | Corre tests/build; no cree claims; no parchea |
| `reviewer` | sí | Calidad CRITICAL/HIGH/LOW |
| `security-reviewer` | sí | Auth/keys/ws/leaks; findings confirmados |
| `docs` | no | `docs/features/` tras verificar |
| `herdr-dispatcher` | no | Split/start/prompt en Herdr; no implementa producto |

Políticas canónicas: `docs/agents/roles/<rol>.md`. Adapters: `.cursor/agents/<rol>.md`. Built-ins de Cursor (`explore`, `bash`, `browser`) no se redefinen.

## 📤 Delegation Rules

- Padre Cursor: trabajo chico in-session; no es un orchestrator estricto.
- Un subagente = una responsabilidad. `builder` no pisa `ws-protocol` ni `frontend`.
- Backend+UI en paralelo (`builder`/`ws-protocol` + `frontend`). TDD nunca al revés (RED antes de GREEN).
- El padre verifica resultados antes de marcar completo. `verifier` FAIL → re-delegar.
- Commits: identidad del owner (`git config`); jamás nombre de agente. Solo si el humano lo pide.
- Cardinal-producto no spawnea agentes en Herdr.

## 🖥️ Cursor Section

- Cursor lee `AGENTS.md` + `.cursor/rules/cardinal.mdc` + `.cursor/agents/`.
- Composer orquesta e implementa lo chico. Especialistas y Herdr se delegan.
- OpenCode CLI es swarm legado, no el camino diario.
```

- [ ] **Step 3: Replace `.cursor/rules/cardinal.mdc` in full**

```markdown
---
description: Cardinal System development rules — Cursor is the development surface; Composer delegates to .cursor/agents
globs: ["*.ts", "*.tsx", "*.json", "*.yaml", "*.md", "*.toml"]
---

# Cardinal System — Development Rules

- Lee `AGENTS.md` para las reglas completas (branching, commits, TDD, versionado)
- Stack: TypeScript + Bun (`Bun.serve`, `bun:sqlite`), React + Vite + Tailwind v4, WebSocket nativo
- Runtime siempre containerizado con Podman — no instalar dependencias nativas en el host
- TDD obligatorio en: auth, keys, ws, db, router (RED → GREEN → REFACTOR)
- Branching: `feature/* → dev → main`. Commits directos a `dev`; PR con review solo para `dev → main` (merge commit)
- Commits: Conventional Commits, primera línea en inglés ≤72 chars, body en español
- Versionado: `MAJOR.FASE.PATCH` (source: `package.json` raíz). En `dev` solo PATCH
- Audit de leaks antes de commit: keys `sk-cardinal-*`, tokens, paths absolutos, emails
- Frontend types DEBEN matchear 1:1 el JSON real del backend (flat fields, no nested) — mismatch = pantalla negra
- El WS del frontend va directo a `ws://127.0.0.1:8787/ws`, NO por el proxy de Vite (roto en Bun)
- Dev URLs: frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:8787` (usar 127.0.0.1, no localhost — cookies)
- Ecosistema y knowledge base: `context/ecosystem.md`

## Cursor como padre

Cursor Composer es la interfaz de desarrollo. Implementá vos los cambios de 1–2 archivos sin lógica crítica. Delegá siempre si toca auth/keys/ws/db/router, es multi-archivo, pide review, docs de feature, verificación, u otro pane/kind.

| Subagente | Usar cuando |
|-----------|-------------|
| `builder` | Implementar spec en packages/ (salvo ws/) y backend/ |
| `ws-protocol` | packages/ws/** |
| `frontend` | frontend/** |
| `tester` | TDD RED (use proactively en ámbitos TDD) |
| `verifier` | Alguien dijo listo (use proactively) |
| `reviewer` | Calidad del diff |
| `security-reviewer` | auth/keys/ws/leaks (use proactively) |
| `docs` | Feature ya verificada |
| `herdr-dispatcher` | Largo, paralelo, aislamiento, otro kind — solo si HERDR_ENV=1 |

Roles canónicos: `docs/agents/roles/`. No spawnees Herdr vos; usá `herdr-dispatcher`. OpenCode CLI es opcional, no el camino diario.
```

- [ ] **Step 4: Verify parent wiring**

Run:

```bash
grep -q 'Cursor es la superficie de desarrollo ahora' AGENTS.md
grep -q 'herdr-dispatcher' AGENTS.md
grep -q 'security-reviewer' AGENTS.md
grep -q 'OpenCode CLI es swarm legado' AGENTS.md || grep -q 'no es el camino diario' AGENTS.md
grep -q 'Cursor Composer es la interfaz de desarrollo' .cursor/rules/cardinal.mdc
grep -q 'planning de features complejas' .cursor/rules/cardinal.mdc && { echo 'old Cursor vs OpenCode section still present'; exit 1; } || true
echo OK
```

Expected: `OK`. The old line “planning de features complejas” must **not** remain in `cardinal.mdc`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md .cursor/rules/cardinal.mdc
git commit -m "$(cat <<'EOF'
docs: make Cursor the development surface and list subagents

AGENTS.md y cardinal.mdc dejan de tratar a Cursor como solo planning visual. Composer delega por tamaño a los 9 subagentes.
EOF
)"
```

---

### Task 6: OpenCode pointers + `verify-dev-setup.sh`

**Files:**
- Modify: `.opencode/agents/builder.md`
- Modify: `.opencode/agents/tester.md`
- Modify: `.opencode/agents/reviewer.md`
- Modify: `.opencode/agents/docs.md`
- Modify: `.opencode/agents/orchestrator.md`
- Modify: `scripts/verify-dev-setup.sh`

**Interfaces:**
- Consumes: role docs from Tasks 1–3
- Produces: OpenCode bodies still valid if role docs move; script fails if a Cursor adapter is missing

Do **not** add new files under `.opencode/agents/`.

- [ ] **Step 1: Insert this paragraph as the first body line after the `# Title` heading in builder, tester, docs** (keep existing rules)

In `.opencode/agents/builder.md`, immediately after `# Builder — Cardinal System`:

```markdown

Política canónica: `docs/agents/roles/builder.md` (leela y no la contradigas). Este archivo solo añade tools/ACLs de OpenCode.
```

In `.opencode/agents/tester.md`, after `# Tester — Cardinal System`:

```markdown

Política canónica: `docs/agents/roles/tester.md` (leela y no la contradigas). Este archivo solo añade tools/ACLs de OpenCode.
```

In `.opencode/agents/docs.md`, after `# Docs — Cardinal System`:

```markdown

Política canónica: `docs/agents/roles/docs.md` (leela y no la contradigas). Este archivo solo añade tools/ACLs de OpenCode.
```

- [ ] **Step 2: OpenCode `reviewer` keeps dual scope** (this runtime has no `security-reviewer`)

After `# Reviewer — Cardinal System` in `.opencode/agents/reviewer.md`:

```markdown

Calidad canónica: `docs/agents/roles/reviewer.md`. En OpenCode no existe `security-reviewer`; evaluá también `docs/agents/prompts/security-review-checklist.md` en el mismo pase. Este archivo solo añade ACLs.
```

Keep the existing “Scope de review” including security — do not delete it.

- [ ] **Step 3: Point OpenCode orchestrator at roles without changing its no-code rule**

After `# Orchestrator — Cardinal System` in `.opencode/agents/orchestrator.md`:

```markdown

Las políticas de `@builder` `@tester` `@reviewer` `@docs` viven en `docs/agents/roles/`. Este runtime no incluye `verifier`, `security-reviewer`, `ws-protocol`, `frontend` ni `herdr-dispatcher` (eso es Cursor). Cursor es la superficie diaria de desarrollo del repo.
```

- [ ] **Step 4: Add a Cursor agents check to `scripts/verify-dev-setup.sh`**

Insert this block **before** `echo "== opencode.json =="`:

```bash
echo "== Cursor agents =="
CURSOR_AGENTS="builder tester docs reviewer security-reviewer verifier ws-protocol frontend herdr-dispatcher"
cursor_count=0
for r in $CURSOR_AGENTS; do
  f=".cursor/agents/$r.md"
  if [ -f "$f" ] && grep -q "^name: $r$" "$f" && grep -q "^model: inherit$" "$f"; then
    cursor_count=$((cursor_count+1))
  else
    bad "adapter Cursor inválido o faltante: $f"
  fi
done
if [ "$cursor_count" -eq 9 ]; then
  ok "9 adapters Cursor (name + model inherit)"
fi
for r in reviewer security-reviewer verifier; do
  if grep -q "^readonly: true$" ".cursor/agents/$r.md" 2>/dev/null; then
    :
  else
    bad "readonly true faltante en .cursor/agents/$r.md"
  fi
done
if grep -q "^readonly: true$" .cursor/agents/reviewer.md \
   && grep -q "^readonly: true$" .cursor/agents/security-reviewer.md \
   && grep -q "^readonly: true$" .cursor/agents/verifier.md; then
  ok "readonly en reviewer, security-reviewer, verifier"
fi
```

Update the header comment of the script from “Cursor rules” to “Cursor rules y .cursor/agents”.

- [ ] **Step 5: Run the verifier**

Run: `bash scripts/verify-dev-setup.sh`

Expected: exit 0. The Cursor agents section shows 9 adapters and readonly checks. OpenCode agent count may fail if `opencode` is not installed — if the script fails only on `opencode no encontrado`, that is pre-existing; do not change that branch unless you also see Cursor-agent failures (those must be zero).

- [ ] **Step 6: Confirm no new OpenCode agents and no soul diffs**

Run:

```bash
ls .opencode/agents/*.md
git diff --stat -- docs/agents/kirito-soul.md docs/agents/agil-soul.md docs/agents/lisbeth-soul.md
```

Expected: still exactly `orchestrator.md`, `builder.md`, `tester.md`, `reviewer.md`, `docs.md`. Empty soul diffstat.

- [ ] **Step 7: Commit**

```bash
git add .opencode/agents/builder.md .opencode/agents/tester.md .opencode/agents/reviewer.md .opencode/agents/docs.md .opencode/agents/orchestrator.md scripts/verify-dev-setup.sh
git commit -m "$(cat <<'EOF'
chore(dev): point OpenCode roles at canonical docs and verify Cursor agents

OpenCode no se expande. verify-dev-setup.sh chequea los 9 adapters de .cursor/agents/.
EOF
)"
```

---

### Task 7: Feature doc, spec status, dry-run

**Files:**
- Create: `docs/features/2026-08-20-cursor-subagents.md`
- Modify: `docs/superpowers/specs/2026-08-20-cursor-subagents-design.md` (status line only)
- Modify: `docs/superpowers/plans/2026-08-20-cursor-subagents.md` is already this plan — do not rewrite it

**Interfaces:**
- Consumes: all previous tasks
- Produces: feature log required by `AGENTS.md`

- [ ] **Step 1: Create `docs/features/2026-08-20-cursor-subagents.md`**

```markdown
# Cursor subagents (2026-08-20)

## Qué se hizo

Nueve subagentes de Cursor (`.cursor/agents/`) y roles canónicos agnósticos en `docs/agents/roles/`. Composer pasa a ser la superficie de desarrollo: delega por tamaño, verifica con `verifier`, y usa `herdr-dispatcher` para otras instancias/kinds si hay Herdr.

## Por qué

El swarm de OpenCode existía, pero el desarrollo diario del repo es Cursor. Hacía falta delegar desde adentro sin duplicar identidades (SOULs) ni hacer que Cardinal spawnee agentes.

## Decisiones

- Híbrido: roles de proceso + especialistas (`ws-protocol`, `frontend`) + `verifier` + `herdr-dispatcher`.
- Capas: role doc agnóstico + adapter Cursor corto. `description` en inglés; cuerpos en español.
- `readonly` en reviewer / security-reviewer / verifier. `is_background: false` en todos.
- OpenCode no se expande; los 5 agentes existentes apuntan al role doc. Reviewer de OpenCode sigue cubriendo security porque ese runtime no tiene `security-reviewer`.
- SOULs y prompts one-shot de PR no se tocaron.

## Alternativas consideradas

- Solo roles de proceso (espejo OpenCode): insuficiente para ws/frontend/Herdr/verifier.
- Especialistas por cada package: demasiado ruido para el Task tool.
- Wrappers flacos (solo “leé el doc”): frágil en contexto vacío.
- Padre orchestrator estricto: peor para diffs de 1–2 archivos.

## Archivos creados/modificados

- Creados: `docs/agents/roles/*.md` (9), `.cursor/agents/*.md` (9), este doc
- Modificados: `AGENTS.md`, `.cursor/rules/cardinal.mdc`, `.opencode/agents/*.md` (punteros), `scripts/verify-dev-setup.sh`, spec status
```

- [ ] **Step 2: Update spec header**

In `docs/superpowers/specs/2026-08-20-cursor-subagents-design.md`, change:

`> Estado: Diseño validado (brainstorm). Pendiente plan de implementación.`

to:

`> Estado: Diseño validado. Plan: docs/superpowers/plans/2026-08-20-cursor-subagents.md`

Remove the footer line `*Siguiente paso: plan en docs/superpowers/plans/ tras aprobación de este spec.*` or replace with `*Implementación: ver el plan.*`

- [ ] **Step 3: Dry-run routing (manual checklist — print PASS/FAIL for each)**

| Pedido | Debe delegar a | No debe |
|--------|----------------|---------|
| Fix JWT expiry | `tester` + `builder` + `verifier` + `security-reviewer` ∥ `reviewer` | padre implementando solo |
| Padding de `AgentCard` | padre o `frontend` | `tester`, `herdr-dispatcher` |
| Ping/pong timeout en `packages/ws` | `tester` + `ws-protocol` + `verifier` | `builder` como zona primaria |
| “está listo el login” | `verifier` primero | `docs` antes de PASS |
| Feature larga en Herdr sin `HERDR_ENV` | fallback in-session que `herdr-dispatcher` declara | `herdr *` |

Run souls check again:

```bash
git diff --stat -- docs/agents/kirito-soul.md docs/agents/agil-soul.md docs/agents/lisbeth-soul.md docs/agents/prompts/
test "$(ls docs/agents/roles/*.md | wc -l)" -eq 9
test "$(ls .cursor/agents/*.md | wc -l)" -eq 9
bash scripts/verify-dev-setup.sh || true
echo DRY-RUN-DONE
```

- [ ] **Step 4: Commit**

```bash
git add docs/features/2026-08-20-cursor-subagents.md docs/superpowers/specs/2026-08-20-cursor-subagents-design.md
git commit -m "$(cat <<'EOF'
docs: record Cursor subagents feature and spec status

Feature doc con qué/por qué/decisiones. El spec apunta al plan de implementación.
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec section | Task |
|--------------|------|
| 1 Objetivo / fuera de alcance | Global Constraints + Tasks 4–6 (no souls, no new OpenCode agents, no app code) |
| 2 Principios | Tasks 1–4 (layers), Task 5 (Cursor surface), Task 6 (OpenCode not expanded) |
| 3 Roster + anti-pisado | Role docs Tasks 1–3, parent table Task 5, dry-run Task 7 |
| 4 Capas / frontmatter | Task 4 Step 10 checks name/model/readonly/is_background |
| 5 Flujo | Task 5 AGENTS.md flujo |
| 6 Herdr | Task 3 herdr-dispatcher + Task 4 adapter |
| 7 Output contracts | REGION output in every role doc |
| 8 OpenCode | Task 6 |
| 10 Verificación | Task 4 Step 10, Task 6 script, Task 7 dry-run |

No placeholders. OpenCode reviewer dual-scope is an explicit spec-compatible exception (no security-reviewer on that runtime).
