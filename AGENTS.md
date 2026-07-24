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

1. Commits/merges van a `dev` sin fricción
2. Cuando `dev` está estable → **un solo PR de `dev` a `main`** con review
3. `main` jamás recibe commits directos

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

## 📁 Estructura

Ver `CONTEXT.md` para el árbol completo del repositorio.

---

*Reglas vivas. Si algo cambia, este archivo se actualiza.*
