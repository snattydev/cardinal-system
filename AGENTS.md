# Cardinal System — Development Rules

> Reglas de desarrollo para agentes que trabajan en este repositorio.
> Para contexto amplio (visión, arquitectura, roadmap), leer [`CONTEXT.md`](./CONTEXT.md).

---

## 🧱 Stack

- **Backend:** TypeScript + [Bun](https://bun.sh) (`Bun.serve`, `bun:sqlite`)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **DB:** SQLite (un solo archivo, cero infra)
- **Real-time:** WebSocket nativo (protocolo en CONTEXT.md)
- **Runtime:** **siempre containerizado** con Podman — no instalar dependencias nativas

---

## 🌿 Branching

| Rama | Rol | Protección |
|------|-----|------------|
| `main` | Producción | PR + review requerido |
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

### Estado actual (2026-07-24)

| Fase | Estado | Spec |
|------|--------|------|
| **Fase 0** — Esqueleto Vivo | ✅ Completa | [`docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md) |
| **Fase 1** — Context Store | 📋 Diseñada | [`docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md) |
| **Fase 2** — One-Shot Pipeline | 📋 Diseñada | [`docs/superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md`](./docs/superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md) |
| **Fase 3+** — Graph + Automations | 🔮 Futuro | — |

---

## 🔢 Versionado

- **Source of truth:** campo `version` en `package.json` raíz
- **Formato:** `MAJOR.FASE.UPDATE` (ej: `0.0.2`)
- **Regla:** **cada PR debe bump version** — si el PR modifica código, la versión sube

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

fix(auth): reject expired JWT with 401 instead of 500
chore: bump version to 0.1.0 — model router MVP
docs: add agent SOULs and review workflow to AGENTS.md
```

**Reglas:**
- Primera línea ≤ 72 chars, **en inglés** (estándar conventional commits)
- Cuerpo **en español** — explicar el *qué* y *por qué*, no el *cómo*
- Si el commit cierra un issue: `Closes #N` al final del cuerpo

---

## 📤 Pull Requests

- **Shinon abre PRs, Santiくん mergea** — jamás auto-merge
- PR a `main` requiere revisión de al menos un agente revisor
- Branch name: `feat/*`, `fix/*`, `chore/*`, `docs/*`
- **Template:** [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) — usar siempre

---

## 👁️ Agentes Revisores

| Agente | Rol | Trigger |
|--------|-----|---------|
| Lisbeth 🔧 | Standard Review (código, claridad, mantenibilidad) | Todo PR a `main` |
| Kirito ⚔️ | Security Review (secrets, inyección, arquitectura) | `@kirito` en PR |
| Agil 🪓 | Pentest (recon, vulnerabilidades, PoC) | One-shot via CAI |

SOULs y prompts: [`docs/agents/`](./docs/agents/)

---

## 🤖 Agentes de Desarrollo

- **Cada feature o task se delega a un subagente one-shot** — Shinon orquesta, no implementa
- Un subagente = una responsabilidad concreta (feature, refactor, auditoría, fix)
- Cada tipo de tarea usa el skill y modelo adecuado según complejidad
- El subagente entrega el resultado → Shinon verifica, commitea y documenta
- Subagentes son **efímeros**: sin estado entre runs, sin memoria persistente
- Tasks complejas se descomponen en múltiples subagentes secuenciales o paralelos

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

---

## 📁 Estructura

Ver `CONTEXT.md` para el árbol completo del repositorio.

### Trackers

- Skills planeadas y pendientes → [`docs/skills.md`](docs/skills.md)
- Cronjobs planeados por fase → [`docs/cronjobs.md`](docs/cronjobs.md)

### Skills activas

- `cardinal-dev` — Workflow completo de desarrollo
- `cardinal-pr` — Crear Pull Requests
- `cardinal-commit` — Formato de commits
- Todas en [`skills/`](skills/)

---

*Reglas vivas. Si algo cambia, este archivo se actualiza.*
