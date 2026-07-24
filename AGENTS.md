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

## 📤 Pull Requests

- **Shinon abre PRs, Santiくん mergea** — jamás auto-merge
- PR a `main` requiere revisión de al menos un agente revisor
- Commits atómicos con mensajes descriptivos ([conventional commits](https://www.conventionalcommits.org/))
- Branch name: `feat/*`, `fix/*`, `chore/*`, `docs/*`

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

- **Cada feature, commit o push debe ser documentado** en el vault
- Ruta: `/home/snatty/Data/The Archive/for-my-agents/docs-agents/`
- Formato: un archivo `.md` por feature o decisión arquitectónica significativa
- El doc debe incluir: qué se hizo, por qué, decisiones tomadas, y archivos creados/modificados
- No hace falta documentar bumps de versión ni cambios triviales de una línea

---

## 📁 Estructura

Ver `CONTEXT.md` para el árbol completo del repositorio.

---

*Reglas vivas. Si algo cambia, este archivo se actualiza.*
