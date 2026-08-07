# Fase 1 — Context Store: Fase completa

**Date:** 2026-08-06
**Version:** 0.1.1 → 0.2.0 (bump FASE en PR dev→main)

## What

El Cardinal pasó de ser un esqueleto vivo (Fase 0: WS hub + dashboard) al
**Context Store central** del ecosistema SAO: ahora guarda perfiles, souls,
skills, memoria, sesiones, configs, dispositivos y sirve búsqueda semántica
sobre el vault.

## Features (16/17, 1 postergada por diseño)

| Sección | Qué | Endpoints |
|---------|-----|-----------|
| 1.1 Profile Registry | tabla `profiles` (migration 1) + seed 4/4 perfiles Hermes | `GET/PUT /api/profiles(/:name)` |
| 1.2 SOUL Registry | tabla `souls` (migration 2, FK→profiles, version) + seed 3/3 | `GET /api/souls/:name` |
| 1.3 Skill Catalog | tablas `skills` + `profile_skills` N:M (migration 3, pinned) | `GET /api/skills(/:name)`, `GET /api/profiles/:name/skills` |
| 1.4 Memory Mirror | tabla `memory_mirror` (migration 4, PK compuesto, sync_direction) | `GET/PUT /api/memories/:profile/:target` |
| 1.5 Session Index | tabla `sessions_index` (migration 5) + seed 246 sesiones reales | `GET /api/sessions` |
| 1.6 Vault RAG Proxy | `packages/rag/` + `rag_cache` (migration 6, TTL 1h, LRU 1000) | `POST /api/rag/search` |
| 1.7 Config Templates | tabla `config_templates` (migration 7, version) + seed 4/4 | `GET/PUT /api/config/:profile` |
| 1.8 Device Registry | `agents.device_info` (migration 8) + broadcast WS | `GET /api/devices`, `POST /api/devices/heartbeat` |

Suite de tests: de 86 a 195 pass / 0 fail (9 archivos de test).

## Decisiones clave

1. **RAG = proxy, no vector store propio.** La spec 3.6 manda: el Cardinal NO
   duplica el índice vectorial en Fase 1. `vault-query` ya existe en el host
   (sqlite-vec + FTS5 + fastembed, 351 files / 2340 chunks indexados). Se creó
   `scripts/vault-query-proxy.py` que expone vault-query como HTTP JSON en
   `host.containers.internal:8788` con token `VAULT_PROXY_TOKEN` (401 sin él),
   y `packages/rag/` cachea resultados en `rag_cache`. sqlite-vec nativo queda
   para Fase 2+ si el vault deja de ser local.
2. **Rutas sin `/v1/context/`** — los endpoints existentes no usan versión en
   el path (`/api/agents`); se mantuvo consistencia con `/api/*` plano.
3. **Seeds solo metadata** — los seeds leen config.yaml/state.db de
   `~/.hermes/profiles/` pero NUNCA mensajes ni contenido de memoria.
   `seed-profiles.py` (4 perfiles), `seed-souls.py` (3 souls de docs/agents/),
   `seed-sessions.py` (246 sesiones), `seed-config.py` (4 configs).
4. **Emojis/tags sin inventar** — display_name capitalizado, emoji/personality_
   tags null donde el ecosistema no los define (se completan manualmente).

## Security Review (agy, claude-opus-4-6-thinking) — APROBADA

- hub.ts (WS): 0 CRITICAL, 0 HIGH, 3 LOW
- server + api: 0 CRITICAL, 2 HIGH → fixeados
- repos + keys: 0 CRITICAL, 0 HIGH, 5 LOW

Fixes aplicados (c60e385): pin de algoritmo HS256 en jwtVerify; cookie
`Secure` cuando NODE_ENV=production; `maxPayloadLength: 4096` en Bun.serve.

## Standard Review (agy) — APROBADA (1 HIGH fixeado)

ISSUE-1: upserts con `??` impedían limpiar campos con null explícito →
cambiado al patrón `!== undefined` (consistente con sessions/memory) + test.

## Archivos

- `packages/db/src/schema.ts` — migrations 1-8
- `packages/db/src/repos.ts` — repos de todas las entidades
- `packages/core/src/types.ts` — tipos compartidos (ProfileRow, SoulRow, ...)
- `backend/src/api/{profiles,souls,skills,memories,sessions,rag,config,devices}.ts`
- `packages/rag/` — nuevo workspace (proxy client + caché)
- `packages/ws/src/hub.ts` — broadcast devices_update (Security Review done)
- `scripts/seed-{profiles,souls,sessions,config}.py`, `scripts/vault-query-proxy.py`

## Pendientes

- **bun run build (frontend)** del checklist pre-merge: bloqueado por issue de
  infra pre-existente (container frontend con mount node_modules roto,
  Permission denied en vite — NO es regresión de Fase 1, todo lo de Fase 1 es
  backend). Issue de infra separado.
- 14 LOW de hardening documentados (timeout identificación WS, rate limiting,
  double body parse en heartbeat, inconsistencia de códigos 404, etc.).
- PUT /api/souls/:name (los agentes lo necesitarán para sync de souls).
