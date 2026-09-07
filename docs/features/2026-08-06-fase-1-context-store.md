# Fase 1 — Context Store: Full Phase

**Date:** 2026-08-06
**Version:** 0.1.1 -> 0.2.0 (bump FASE in dev->main PR)

## What

Cardinal transitioned from a minimal skeleton (Fase 0: WS hub + dashboard) to
the **central Context Store** of the SAO ecosystem: it now stores profiles,
souls, skills, memory, sessions, configs, devices, and serves semantic search
over the vault.

## Features (16/17, 1 deferred by design)

| Section | What | Endpoints |
|---------|------|-----------|
| 1.1 Profile Registry | `profiles` table (migration 1) + 4/4 Hermes profiles seed | `GET/PUT /api/profiles(/:name)` |
| 1.2 SOUL Registry | `souls` table (migration 2, FK->profiles, version) + 3/3 seed | `GET /api/souls/:name` |
| 1.3 Skill Catalog | `skills` + `profile_skills` N:M tables (migration 3, pinned) | `GET /api/skills(/:name)`, `GET /api/profiles/:name/skills` |
| 1.4 Memory Mirror | `memory_mirror` table (migration 4, composite PK, sync_direction) | `GET/PUT /api/memories/:profile/:target` |
| 1.5 Session Index | `sessions_index` table (migration 5) + 246 real sessions seed | `GET /api/sessions` |
| 1.6 Vault RAG Proxy | `packages/rag/` + `rag_cache` (migration 6, TTL 1h, LRU 1000) | `POST /api/rag/search` |
| 1.7 Config Templates | `config_templates` table (migration 7, version) + 4/4 seed | `GET/PUT /api/config/:profile` |
| 1.8 Device Registry | `agents.device_info` (migration 8) + WS broadcast | `GET /api/devices`, `POST /api/devices/heartbeat` |

Test suite: from 86 to 195 pass / 0 fail (9 test files).

## Key Decisions

1. **RAG = proxy, not embedded vector store.** Spec 3.6 dictates: Cardinal does
   NOT duplicate the vector index in Fase 1. `vault-query` already exists on the
   host (sqlite-vec + FTS5 + fastembed, 351 files / 2340 chunks indexed). Created
   `scripts/vault-query-proxy.py` exposing vault-query as HTTP JSON at
   `host.containers.internal:8788` with token `VAULT_PROXY_TOKEN` (401 without it),
   and `packages/rag/` caches results in `rag_cache`. Native sqlite-vec is
   reserved for Fase 2+ if the vault ceases to be local.
2. **Routes without `/v1/context/`** — existing endpoints do not use path
   versioning (`/api/agents`); maintained consistency with flat `/api/*`.
3. **Seeds metadata only** — seeds read config.yaml/state.db from
   `~/.hermes/profiles/` but NEVER messages or memory content.
   `seed-profiles.py` (4 profiles), `seed-souls.py` (3 souls from docs/agents/),
   `seed-sessions.py` (246 sessions), `seed-config.py` (4 configs).
4. **No invented emojis/tags** — capitalized display_name, null emoji/personality_tags
   where ecosystem does not define them (completed manually).

## Security Review (agy, claude-opus-4-6-thinking) — APPROVED

- hub.ts (WS): 0 CRITICAL, 0 HIGH, 3 LOW
- server + api: 0 CRITICAL, 2 HIGH -> fixed
- repos + keys: 0 CRITICAL, 0 HIGH, 5 LOW

Fixes applied (c60e385): pinned HS256 algorithm in jwtVerify; `Secure` cookie
when NODE_ENV=production; `maxPayloadLength: 4096` in Bun.serve.

## Standard Review (agy) — APPROVED (1 HIGH fixed)

ISSUE-1: upserts using `??` prevented clearing fields with explicit null ->
changed to `!== undefined` pattern (consistent with sessions/memory) + test.

## Files

- `packages/db/src/schema.ts` — migrations 1-8
- `packages/db/src/repos.ts` — repos for all entities
- `packages/core/src/types.ts` — shared types (ProfileRow, SoulRow, ...)
- `backend/src/api/{profiles,souls,skills,memories,sessions,rag,config,devices}.ts`
- `packages/rag/` — new workspace (proxy client + cache)
- `packages/ws/src/hub.ts` — broadcast devices_update (Security Review done)
- `scripts/seed-{profiles,souls,sessions,config}.py`, `scripts/vault-query-proxy.py`

## Pending Items

- **bun run build (frontend)** from pre-merge checklist: blocked by pre-existing
  infra issue (frontend container with broken node_modules mount, Permission
  denied in vite — NOT a Fase 1 regression, everything in Fase 1 is backend).
  Separate infra issue.
- 14 LOW hardening items documented (WS identification timeout, rate limiting,
  double body parse in heartbeat, 404 code inconsistencies, etc.).
- PUT /api/souls/:name (agents will need it for soul sync).
