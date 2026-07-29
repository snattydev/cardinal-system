# Cardinal System — Development Rules

> Reglas de desarrollo. Solo roles, sin nombres.

**Referencias:**
- [`docs/vision.md`](./docs/vision.md) — objetivo y principios
- [`docs/stack.md`](./docs/stack.md) — stack técnico
- [`docs/security.md`](./docs/security.md) — modelo de seguridad
- [`docs/roadmap.md`](./docs/roadmap.md) — fases y prioridades
- [`context/ecosystem.md`](./context/ecosystem.md) — knowledge base

---

## 🧱 Stack

- **Backend:** TypeScript + [Bun](https://bun.sh) (`Bun.serve`, `bun:sqlite`)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **DB:** SQLite (un solo archivo, cero infra)
- **Real-time:** WebSocket nativo (ver [`docs/superpowers/specs/`](./docs/superpowers/specs/))
- **Runtime:** **siempre containerizado** con Podman — no instalar dependencias nativas

---

## 🌿 Branching

| Rama | Rol | Protección |
|------|-----|------------|
| `main` | Producción | PR + review requerido, merge commit |
| `dev` | Integración | Push/merge directo permitido |

**Workflow:**

```
feature/* ──→ dev ──→ main
chore/*  ──→ dev ──→ main
fix/*    ──→ dev ──→ main
```

1. Commits y merges van **directo a `dev`** — sin PR, sin review
2. Cuando `dev` está estable → **un solo PR de `dev` a `main`** con review
3. `main` jamás recibe commits directos
4. **PRs solo existen para `dev → main`** — es el único punto donde hay algo que revisar
5. **Merge strategy:** merge commit (historia completa, sin squash). `dev` y `main` nunca divergen.

### Estado actual (2026-07-28)

| Fase | Estado | Spec |
|------|--------|------|
| **Fase 0** — Esqueleto Vivo | ✅ Completa | [`docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md) |
| **Fase 1** — Context Store | 📋 Diseñada | [`docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md) |
| **Fase 2** — One-Shot Pipeline | 📋 Diseñada | [`docs/superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md`](./docs/superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md) |
| **Fase 3+** — Graph + Automations | 🔮 Futuro | — |

---

## 🔢 Versionado

- **Source of truth:** campo `version` en `package.json` raíz
- **Formato:** `MAJOR.FASE.PATCH` — ej: `0.0.2`
  - **MAJOR**: `0` hasta que el sistema sea estable → `1.0.0`
  - **FASE**: fase actual del roadmap (0, 1, 2...), se bupea en el PR `dev → main`
  - **PATCH**: incrementos incrementales dentro de la fase (features, fixes, docs)
- **Regla:** en `dev` solo se bupea PATCH; la FASE se bupea una sola vez en el PR `dev → main`

---

## 📋 Commits

**Formato:** [Conventional Commits](https://www.conventionalcommits.org/)

```
<type>(<scope>): <descripción breve en inglés>

<opcional: cuerpo con qué, por qué, y decisiones>
```

**Tipos:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`

**Ejemplos:**

```
feat(ws): add agent heartbeat with ping/pong protocol

Implementación del keep-alive sobre WebSocket. 30s de intervalo,
2 pings perdidos = desconexión. Evento emitido al dashboard.
```

```
fix(auth): reject expired JWT with 401 instead of 500
```

```
chore: bump version to 0.1.0 — model router MVP
```

```
docs: add SOULs and review workflow to AGENTS.md
```

**Reglas:**
- Primera línea ≤ 72 chars, **en inglés** (estándar conventional commits)
- Cuerpo **en español** — explicar el *qué* y *por qué*, no el *cómo*
- Si el commit cierra un issue: `Closes #N` al final del cuerpo
- **Autoría:** el commit debe usar el nombre y email del usuario de GitHub que tiene acceso al repo (`git config user.name` / `user.email`), no el nombre de ningún agente. Todos los agentes deben heredar la identidad del owner.

---

## 📤 Pull Requests

### Flujo `dev → main`

1. `dev` acumula features, fixes, docs
2. Cuando está estable → se abre PR de `dev` a `main`
3. El orquestador (fuera del repo) abre el PR
4. El humano (fuera del repo) revisa y mergea
5. **Nunca auto-merge**

### Pre-merge checklist (obligatorio)

- [ ] `bun test` pasa completo (todos los packages + backend)
- [ ] `bun run build` pasa (frontend/)
- [ ] Audit de leaks: keys, tokens, paths absolutos, emails
- [ ] Standard Review aprobado (código, claridad, mantenibilidad)
- [ ] Security Review aprobado si hubo cambios en `auth/`, `keys/`, `ws/` o protocolo
- [ ] Version bump en `package.json` si corresponde
- [ ] `docs/features/<fecha>-<nombre>.md` creado o actualizado

### Merge strategy

**Merge commit.** Se usa merge estándar (no squash). Todos los commits de `dev` pasan a `main` con un merge commit explícito. `dev` y `main` nunca divergen — no hay necesidad de realinear después del merge.

---

## 👁️ Roles de Revisión

Los agentes revisores son roles, no identidades fijas. Cualquier agente puede asumir
un rol según el contexto. Los nombres específicos se asignan fuera del repo.

| Rol | Disparador | Scope |
|-----|-----------|-------|
| **Standard Review** | Todo PR a `main` | Código, claridad, mantenibilidad, tests |
| **Security Review** | Cambios en `auth/`, `keys/`, `ws/`, protocolo | Secrets, inyección, arquitectura de seguridad |
| **Pentest** | One-shot, bajo demanda | Recon, vulnerabilidades, PoC |

Templates de review: [`docs/agents/prompts/standard-review.md`](./docs/agents/prompts/standard-review.md)

---

## 🧪 Test-Driven Development (TDD)

### Ámbitos con TDD obligatorio (RED → GREEN → REFACTOR → COMMIT)

| Ámbito | Qué cubre | Riesgo si falla |
|--------|-----------|-----------------|
| **Auth** | JWT sign/verify, expiración, login flow, cookie | Acceso no autorizado al sistema |
| **Keys** | Generación, hashing SHA-256, validación, revocación | Suplantación de identidad de agentes |
| **Protocolo WS** | Parseo de mensajes, state machine, ping/pong, timeout | Desconexiones silenciosas, estado corrupto |
| **DB** | Migraciones, integridad de schema, queries críticas | Pérdida de datos, corrupción |
| **Router** | Fallback chain, rate limiting, budget enforcement | Consumo descontrolado de APIs externas |

### Flujo TDD por feature

```
1. RED     → bun test --watch              # escribí el test que FALLA
2. GREEN   → implementación mínima         # corré el test → PASA
3. REFACTOR → limpiá sin romper tests      # corré el test → sigue PASANDO
4. COMMIT  → solo después de GREEN        # nunca committear tests rotos
```

### Ámbitos sin TDD obligatorio (test después, o solo typecheck)

| Ámbito | Verificación |
|--------|-------------|
| Frontend components | `bun run build` (typecheck + Vite build) |
| CSS / estilos | Revisión visual (manual) |
| Docs, configs, deploy | Revisión humana |

---

## 🤖 Agentes de Desarrollo

- **El orquestador coordina, los subagentes implementan**
- Un subagente = una responsabilidad concreta (feature, refactor, auditoría, fix)
- El subagente entrega el resultado → el orquestador verifica, commitea y documenta
- Subagentes son **efímeros**: sin estado entre runs, sin memoria persistente
- Tasks complejas se descomponen en múltiples subagentes secuenciales o paralelos

### Workflow completo por feature

1. **Delegar** — subagente(s) implementan la feature
2. **Verificar** — build, tests, revisión manual
3. **Documentar** — `docs/features/<fecha>-<nombre>.md` con qué, por qué, decisiones, alternativas, archivos
4. **Commit + push** — conventional commit a `dev` incluyendo el doc

---

## 🐳 Containerización

- **Dev local:** `compose.yaml` (`podman-compose`)
- **Prod:** Podman Quadlet (archivos en `deploy/quadlet/`)
- **Pod:** `cardinal` (Caddy + Nginx + Bun backend)
- Imágenes: `localhost/cardinal-backend:latest`, `localhost/cardinal-frontend:latest`
- Nunca exponer puertos sin Caddy delante

---

## 🔒 Seguridad

- **Auditar leaks antes de push:** keys, tokens, paths absolutos, emails
- `.env` y secretos **nunca committeados** — usar `.env.example` como template
- API keys de agentes: formato `sk-cardinal-*`, almacenadas como SHA-256 en DB
- Nada expuesto sin auth layer

---

## 📝 Documentación

- **Cada feature, fix o patch debe tener un doc completo en el repo**
- Ruta: `docs/features/<nombre>.md` dentro del repo
- El doc debe incluir: **qué se hizo, por qué, decisiones tomadas, alternativas consideradas, y archivos creados/modificados**
- La PR template es solo un resumen — **el detalle completo vive en el doc de la feature**
- No hace falta documentar bumps de versión ni cambios triviales de una línea

### Documentación para agentes (BMAD-lite)

Los archivos en `docs/agents/` pueden usar delimitadores para lazy-loading:

```markdown
<!-- REGION: standard-review-checklist -->
## Standard Review Checklist
...
<!-- ENDREGION: standard-review-checklist -->
```

Los agentes pueden cargar solo la región que necesitan sin leer el archivo entero.
Esto aplica a: SOULs, prompts de review, checklists de seguridad.

---

## 📁 Estructura del Repositorio

```
cardinal-system/
├── packages/                  ← Bun workspaces (paquetes internos)
│   ├── core/                  tipos compartidos, config, zod schemas
│   ├── auth/                  JWT sign/verify, login, logout
│   ├── keys/                  generación, hash, revocación
│   ├── ws/                    protocolo, hub, mensajes
│   ├── db/                    schema, migraciones, queries
│   └── router/                model routing (Fase 2)
├── backend/
│   └── src/                   composición: server, api handlers, static serve
├── frontend/
│   └── src/                   React + Vite + Tailwind v4
├── examples/
│   └── ws-agent.ts            cliente WS de referencia (no SDK)
├── deploy/
│   ├── Containerfile
│   ├── Caddyfile.example
│   └── quadlet/
├── docs/
│   ├── features/              documentación de features completadas
│   ├── agents/                SOULs, prompts, checklists de revisión
│   │   └── prompts/
│   ├── superpowers/
│   │   ├── specs/             specs de diseño por fase
│   │   └── plans/             planes de implementación
│   └── references/            charlas, papers, arquitecturas externas
├── skills/                    skills de Hermes para desarrollo del Cardinal
├── AGENTS.md                  este archivo
├── README.md
└── package.json               workspaces + version source of truth
```

### Trackers

- Skills planeadas y pendientes → [`docs/skills.md`](docs/skills.md)
- Cronjobs planeados por fase → [`docs/cronjobs.md`](docs/cronjobs.md)

### Skills activas

- `cardinal-dev` — Workflow completo de desarrollo
- `cardinal-pr` — Crear Pull Requests
- `cardinal-commit` — Formato de commits

---

*Reglas vivas. Si algo cambia, este archivo se actualiza.*
