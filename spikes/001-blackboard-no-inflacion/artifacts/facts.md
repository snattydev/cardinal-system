# Cardinal v0.2.0 — datos para release notes

Recopilado por: researcher (Hermes)

## Features de Fase 1 (Context Store)

- Memory Mirror: GET/PUT /api/memories/:profile/:target — espejo de memoria (target memory|user) por perfil.
- Session Index: GET /api/sessions — índice de sesiones Hermes, orden DESC por started_at.
- Vault RAG Proxy: POST /api/rag/search — búsqueda semántica sobre el vault (sqlite-vec + fastembed), caché TTL 1h.
- Config Templates: GET/PUT /api/config/:profile — templates de config versionados por perfil.
- Device Registry: GET /api/devices + POST /api/devices/heartbeat — registro de dispositivos con broadcast WS.
- Profiles, Souls, Skills (catálogo) — lectura del contexto del ecosistema.

## Fixes

- auth: pin de algoritmo JWT (HS256) + cookie Secure en producción.
- db: permitir limpiar campos con null explícito en upserts.

## Versión

- 0.2.0 (formato MAJOR.FASE.PATCH)

## Pedido

Nota breve estilo changelog, en español, para el repo.
