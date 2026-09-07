# Cardinal v0.2.0 — Release Notes

Short changelog for Phase 1 (Context Store).

## Features

- **Memory Mirror**: `GET/PUT /api/memories/:profile/:target` — memory mirror (target `memory|user`) per profile.
- **Session Index**: `GET /api/sessions` — Hermes session index, descending by `started_at`.
- **Vault RAG Proxy**: `POST /api/rag/search` — semantic search over the vault (sqlite-vec + fastembed), 1h TTL cache.
- **Config Templates**: `GET/PUT /api/config/:profile` — versioned config templates per profile.
- **Device Registry**: `GET /api/devices` + `POST /api/devices/heartbeat` — device registry with WebSocket broadcast.
- **Profiles, Souls, Skills (catalog)**: ecosystem context reads.

## Fixes

- **auth**: pin JWT algorithm (HS256) + `Secure` cookie in production.
- **db**: allow clearing fields with explicit `null` in upserts.

## Version

- `0.2.0` (`MAJOR.FASE.PATCH` format)
