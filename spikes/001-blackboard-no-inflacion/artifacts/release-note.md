# Cardinal v0.2.0 — Release Notes

Changelog breve de la Fase 1 (Context Store).

## Features

- **Memory Mirror**: `GET/PUT /api/memories/:profile/:target` — espejo de memoria (target `memory|user`) por perfil.
- **Session Index**: `GET /api/sessions` — índice de sesiones Hermes, orden descendente por `started_at`.
- **Vault RAG Proxy**: `POST /api/rag/search` — búsqueda semántica sobre el vault (sqlite-vec + fastembed), caché TTL 1h.
- **Config Templates**: `GET/PUT /api/config/:profile` — templates de config versionados por perfil.
- **Device Registry**: `GET /api/devices` + `POST /api/devices/heartbeat` — registro de dispositivos con broadcast WebSocket.
- **Profiles, Souls, Skills (catálogo)**: lectura del contexto del ecosistema.

## Fixes

- **auth**: pin de algoritmo JWT (HS256) + cookie `Secure` en producción.
- **db**: permitir limpiar campos con `null` explícito en upserts.

## Versión

- `0.2.0` (formato `MAJOR.FASE.PATCH`)
