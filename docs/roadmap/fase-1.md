# Phase 1 — Context Store

> Spec: [`../superpowers/specs/2026-07-23-cardinal-context-store-design.md`](../superpowers/specs/2026-07-23-cardinal-context-store-design.md)

---

## 0. Pre-Phase 1: Structural refactors (today)

Before touching F1 features, split the monolith into Bun workspaces.

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1 | Create `packages/core/` — types, config, zod schemas | Cursor Pro | No | Complete (PR #5) |
| 2 | Create `packages/db/` — schema, migrations, queries | Cursor Pro | Yes | Complete (PR #5) |
| 3 | Create `packages/auth/` — JWT sign/verify, login, logout | Cursor Pro | Yes | Complete (PR #5) |
| 4 | Create `packages/keys/` — keygen, SHA-256 hash, validate, revoke | OpenCode GO | Yes | Complete (PR #5) |
| 5 | Create `packages/ws/` — zod protocol, hub, agent lifecycle | OpenCode GO | Yes | Complete (PR #5) |
| 6 | Slim down `backend/src/index.ts` — package composition only | Antigravity | No | Complete (PR #5) |

> Updated 2026-08-06: tasks 1–6 completed in PR #5 (v0.1.1). The ACP bridge tasks for ZED from the original checklist were removed — ZED is not in use.

---

## 1. Phase 1: Context Store Features

### 1.1 Profile Registry

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.1.1 | `profiles` table in DB (name, device, skin, config_ref) | opencode | Yes | Complete (534d8bb) |
| 1.1.2 | `GET/PUT /api/profiles` API | opencode | Yes | Complete (f069191) |
| 1.1.3 | Sync with existing Hermes profiles (PC) | direct | No | Complete (seed-profiles.py — 4/4) |

### 1.2 SOUL Registry

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.2.1 | `souls` table + `GET /api/souls/:name` endpoint | opencode | Yes | Complete (0da16d7) |
| 1.2.2 | Migrate `docs/agents/*.md` → DB (initial seed) | direct | No | Complete (seed-souls.py — 3/3) |

### 1.3 Skill Catalog

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.3.1 | `skills` + `profile_skills` tables (N:M) | opencode | Yes | Complete (same commit as 1.3.2) |
| 1.3.2 | `GET /api/skills`, `GET /api/profiles/:name/skills` API | opencode | Yes | Complete (1.3.1+c) |

### 1.4 Memory Mirror

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.4.1 | `memories` table (key-value per profile) | opencode | Yes | Complete (same commit as 1.4.2) |
| 1.4.2 | `GET/PUT /api/memories/:profile` API | opencode | Yes | Complete (1.4.1+c) |

### 1.5 Session Index

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.5.1 | `sessions` table + `GET /api/sessions` endpoint | opencode | Yes | Complete (f0f5f4d) |
| 1.5.2 | Index Hermes sessions (local DB → Cardinal) | direct | No | Complete (seed-sessions.py — 246) |

### 1.6 Vault RAG Proxy (spec approach — proxy, not self-hosted vector store)

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.6.1 | Integrate sqlite-vec in `packages/rag/` | — | — | Deferred to Phase 2+ (spec 3.6) |
| 1.6.2 | Index `context/*.md` in vector store | — | — | Index lives in host vault-query (351 files/2340 chunks) |
| 1.6.3 | `POST /api/rag/search` API (semantic search) | opencode | Yes | Complete (f137873) |

> Decision 2026-08-06: implemented spec approach (proxy with cache),
> NOT native sqlite-vec. vault-query already exists on host (sqlite-vec + FTS5 +
> fastembed) — Cardinal calls scripts/vault-query-proxy.py over HTTP
> (host.containers.internal:8788, token VAULT_PROXY_TOKEN) and caches in
> rag_cache (TTL 1h, LRU 1000). Self-hosted vector store: Phase 2+ if vault
> stops being local.

### 1.7 Config Templates

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.7.1 | `config_templates` table + seed from Hermes profiles | opencode | Yes | Complete (1.7.1+2, seed-config.py 4/4) |
| 1.7.2 | `GET /api/config/:profile` API (returns config.yaml-like) | opencode | Yes | Complete (1.7.1+c) |

### 1.8 Device Registry

| # | Task | Tool | TDD | Status |
|---|------|------|-----|--------|
| 1.8.1 | Extend `agents` table with `device_info` JSON | opencode | Yes | Complete (719bbd2) |
| 1.8.2 | `GET /api/devices` API + WS broadcast | opencode | Yes | Complete (719bbd2) |

> Note: Security Review required before merge dev→main (touched packages/ws/hub.ts).

---

## Progress

```
Pre-F1 refactors:  6/6  [====================]
F1 features:        16/17 [==================..]
Total F1:           22/23 [====================]
```
