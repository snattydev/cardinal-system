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

### Post-merge alignment (obligatorio)

Después de cada squash merge `dev → main`:

```bash
git checkout dev
git reset --hard origin/main
# Cherry-pick commits nuevos que no estaban en el PR mergeado
git cherry-pick <hash> ...
git push origin dev --force-with-lease
```

Esto elimina la divergencia cosmética ("N ahead, M behind") que GitHub muestra después de un squash merge. **Toda tarea de review de PR debe incluir este paso** — no cerrar el PR sin alinear `dev` con `main`.

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
- [ ] Versión bump en `package.json` (solo FASE en PR `dev → main`, PATCH en `dev`)
- [ ] Documentado en `docs/features/<fecha>-<nombre>.md` (qué, por qué, decisiones, archivos)
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
- **Autoría:** el commit debe usar el nombre y email del usuario de GitHub (`git config user.name` / `user.email`), no el del agente. Todos los agentes heredan la identidad del owner.

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
- Formato: `MAJOR.FASE.PATCH` — ej: `0.0.2`
  - **MAJOR**: `0` hasta estable → `1.0.0`
  - **FASE**: roadmap actual, se bump ea solo en PR `dev → main`
  - **PATCH**: incremental por feature/fix/chore en `dev`

---

## 🤖 Agentes de Desarrollo

- **Cada feature o task se delega a un subagente one-shot** — el orquestador coordina, no implementa
- Un subagente = una responsabilidad concreta
- Subagentes son **efímeros**: sin estado entre runs
- Tasks complejas → múltiples subagentes secuenciales o paralelos
- El orquestador verifica, commitea y documenta el resultado

---

## 👁️ Roles de Revisión

| Rol | Scope | Trigger |
|-----|-------|---------|
| Standard Review | Código, claridad, mantenibilidad | Todo PR a `main` |
| Security Review | Secrets, inyección, arquitectura | Bajo demanda en PR |
| Pentest | Recon, vulnerabilidades, PoC | One-shot

---

## 📝 Documentación

- **Cada feature, fix o patch debe tener doc completo en el repo**
- Ruta: `docs/features/<fecha>-<nombre>.md`
- Incluir: qué, por qué, decisiones, alternativas, archivos creados/modificados
- La PR template es solo resumen — el detalle vive en el doc de la feature
- No documentar bumps de versión ni cambios triviales de una línea

### Workflow por feature

1. **Delegar** — subagente(s) implementan
2. **Verificar** — build, tests, revisión
3. **Documentar** — `docs/features/<fecha>-<nombre>.md`
4. **Commit + push** — conventional commit a `dev` incluyendo el doc

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
