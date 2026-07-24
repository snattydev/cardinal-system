---
name: cardinal-dev
description: Workflow de desarrollo para Cardinal System — PRs, commits, branching, versionado y documentación. Usar al trabajar en snattydev/cardinal-system.
category: development
---

# Cardinal System — Development Workflow

## 🌿 Branching

```
feature/* ──→ dev ──→ main
chore/*  ──→ dev ──→ main
fix/*    ──→ dev ──→ main
```

| Rama | Rol | Protección |
|------|-----|------------|
| `main` | Producción | PR + review requerido |
| `dev` | Integración | Push/merge directo, sin PR |

1. Commits y merges van **directo a `dev`** — sin PR, sin review
2. Cuando `dev` está estable → **un solo PR de `dev` a `main`** con review
3. **PRs solo existen para `dev → main`**
4. `main` jamás recibe commits directos

---

## 📋 PR Template

Resumen ejecutivo (el detalle completo va en doc de vault):

```markdown
## 📋 Resumen
<!-- Qué hace y por qué. Una o dos frases. -->

## 🔍 Cambios
- 
- 

## ⚠️ Breaking
<!-- ¿Algo se rompe? Si no, "Ninguno". -->

## 🧪 Cómo probar
1. 
2. 

## 🗂️ Documentación
- 

## ✅ Checklist
- [ ] Versión bump en `package.json`
- [ ] Documentado en vault (completo: qué, por qué, decisiones, archivos)
- [ ] Sin leaks (keys, tokens, paths, emails)
- [ ] Probado localmente
```

---

## 📋 Commits

**Formato:** Conventional Commits

```
<type>(<scope>): <descripción breve en inglés>

<cuerpo en español: qué y por qué>
```

**Tipos:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`

**Reglas:**
- Primera línea ≤ 72 chars, **en inglés**
- Cuerpo **en español** — explicar el *qué* y *por qué*, no el *cómo*
- Si cierra un issue: `Closes #N` al final

**Ejemplos:**
```
feat(ws): add agent heartbeat with ping/pong protocol

Implementación del keep-alive sobre WebSocket. 30s de intervalo,
2 pings perdidos = desconexión. Evento emitido al dashboard.

fix(auth): reject expired JWT with 401 instead of 500
chore: bump version to 0.1.0 — model router MVP
```

---

## 🔢 Versionado

- Source of truth: `version` en `package.json` raíz
- Formato: Semver — `MAJOR.MINOR.PATCH`
- MAJOR = 0 hasta que sea estable → `1.0.0`
- **Bump solo en PR `dev → main`** — en `dev` no se toca

| Cambios acumulados | Bump |
|---|---|
| Fixes, security, docs, chores | PATCH |
| Nuevas features | MINOR |
| Breaking changes | MAJOR |

---

## 🤖 Agentes de Desarrollo

- **Cada feature o task se delega a un subagente one-shot** — Shinon orquesta, no implementa
- Un subagente = una responsabilidad concreta
- Subagentes son **efímeros**: sin estado entre runs
- Tasks complejas → múltiples subagentes secuenciales o paralelos
- Shinon verifica, commitea y documenta el resultado

---

## 👁️ Agentes Revisores

| Agente | Rol | Trigger |
|--------|-----|---------|
| Lisbeth 🔧 | Standard Review (código, claridad, mantenibilidad) | Todo PR a `main` |
| Kirito ⚔️ | Security Review (secrets, inyección, arquitectura) | `@kirito` en PR |
| Agil 🪓 | Pentest (recon, vulnerabilidades, PoC) | One-shot via CAI |

---

## 📝 Documentación

- **Cada feature, fix o patch debe tener doc completo en el repo**
- Ruta: `docs/features/<nombre>.md` dentro del repo
- Incluir: qué, por qué, decisiones, alternativas, archivos
- La PR template es solo resumen — el detalle vive en el doc de la feature
- No documentar bumps ni cambios triviales de una línea

---

## 🔒 Seguridad

- Auditar leaks antes de push: keys, tokens, paths absolutos, emails
- `.env` y secretos **nunca committeados**
- API keys: formato `sk-cardinal-*`, SHA-256 en DB
- Nada expuesto sin auth layer

---

## 🧱 Stack

- Backend: TypeScript + Bun (`Bun.serve`, `bun:sqlite`)
- Frontend: React + TypeScript + Vite + Tailwind
- DB: SQLite
- Real-time: WebSocket nativo
- Runtime: siempre containerizado con Podman
- Dev: `compose.yaml`, Prod: Podman Quadlet
