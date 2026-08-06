# Fase 1 — Context Store 🏗️

> Spec: [`../superpowers/specs/2026-07-23-cardinal-context-store-design.md`](../superpowers/specs/2026-07-23-cardinal-context-store-design.md)

---

## 0. Pre-Fase 1: Refactors estructurales (hoy)

Antes de tocar features de F1, partir el monolito en Bun workspaces.

| # | Tarea | Tool | TDD | Estado |
|---|-------|------|-----|--------|
| 1 | Crear `packages/core/` — tipos, config, zod schemas | Cursor Pro | No | ✅ (PR #5) |
| 2 | Crear `packages/db/` — schema, migraciones, queries | Cursor Pro | Sí | ✅ (PR #5) |
| 3 | Crear `packages/auth/` — JWT sign/verify, login, logout | Cursor Pro | Sí | ✅ (PR #5) |
| 4 | Crear `packages/keys/` — keygen, hash SHA-256, validate, revoke | OpenCode GO | Sí | ✅ (PR #5) |
| 5 | Crear `packages/ws/` — protocolo zod, hub, agent lifecycle | OpenCode GO | Sí | ✅ (PR #5) |
| 6 | Adelgazar `backend/src/index.ts` — solo composición de packages | Antigravity | No | ✅ (PR #5) |

> Actualizado 2026-08-06: tareas 1–6 completadas en PR #5 (v0.1.1). Las tareas de bridge ACP para ZED del checklist original se eliminaron — ZED no está en uso.

---

## 1. Fase 1: Features del Context Store

### 1.1 Profile Registry ✅

| # | Tarea | Tool | TDD | Estado |
|---|-------|------|-----|--------|
| 1.1.1 | Tabla `profiles` en DB (name, device, skin, config_ref) | opencode | Sí | ✅ (534d8bb) |
| 1.1.2 | API `GET/PUT /api/profiles` | opencode | Sí | ✅ (f069191) |
| 1.1.3 | Sincronizar con perfiles Hermes existentes (PC) | directo | No | ✅ (seed-profiles.py — 4/4) |

### 1.2 SOUL Registry ✅

| # | Tarea | Tool | TDD | Estado |
|---|-------|------|-----|--------|
| 1.2.1 | Tabla `souls` + endpoint `GET /api/souls/:name` | opencode | Sí | ✅ (0da16d7) |
| 1.2.2 | Migrar `docs/agents/*.md` → DB (seed inicial) | directo | No | ✅ (seed-souls.py — 3/3) |

### 1.3 Skill Catalog ✅

| # | Tarea | Tool | TDD | Estado |
|---|-------|------|-----|--------|
| 1.3.1 | Tabla `skills` + `profile_skills` (N:M) | opencode | Sí | ✅ (mismo commit que 1.3.2) |
| 1.3.2 | API `GET /api/skills`, `GET /api/profiles/:name/skills` | opencode | Sí | ✅ (1.3.1+c) |

### 1.4 Memory Mirror ✅

| # | Tarea | Tool | TDD | Estado |
|---|-------|------|-----|--------|
| 1.4.1 | Tabla `memories` (key-value por perfil) | opencode | Sí | ✅ (mismo commit que 1.4.2) |
| 1.4.2 | API `GET/PUT /api/memories/:profile` | opencode | Sí | ✅ (1.4.1+c) |

### 1.5 Session Index ✅

| # | Tarea | Tool | TDD | Estado |
|---|-------|------|-----|--------|
| 1.5.1 | Tabla `sessions` + endpoint `GET /api/sessions` | opencode | Sí | ✅ (f0f5f4d) |
| 1.5.2 | Indexar sesiones de Hermes (DB local → Cardinal) | directo | No | ✅ (seed-sessions.py — 246) |

### 1.6 Vault RAG Proxy

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 1.6.1 | Integrar sqlite-vec en `packages/rag/` | Cursor Pro | Sí |
| 1.6.2 | Indexar `context/*.md` en vector store | Antigravity | No |
| 1.6.3 | API `POST /api/rag/search` (búsqueda semántica) | Cursor Pro | Sí |

### 1.7 Config Templates

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 1.7.1 | Tabla `config_templates` + seed desde perfiles Hermes | OpenCode GO | Sí |
| 1.7.2 | API `GET /api/config/:profile` (devuelve config.yaml-like) | OpenCode GO | Sí |

### 1.8 Device Registry

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 1.8.1 | Extender tabla `agents` con `device_info` JSON | Cursor Pro | Sí |
| 1.8.2 | API `GET /api/devices` + WS broadcast | Cursor Pro | Sí |

---

## 📊 Progreso

```
Pre-F1 refactors:  6/6  ████████████████████
F1 features:        11/17 ███████████░░░░░░░░░
Total F1:           17/23 █████████████████░░░░░
```
