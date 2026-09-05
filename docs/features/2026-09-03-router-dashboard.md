# Dashboard operativo `/router` (JWT) (2026-09-03)

Pilar 2 de Cardinal v2. El dashboard JWT muestra providers, modelos y alias del
router ya persistidos. No es dual-auth: mismo patrón cookie que `/api/keys`.

## Qué se hizo

- API de dashboard JWT (cookie de sesión, **no** Bearer de agente):
  - `GET /api/router/providers` → `{ providers, models }` en snake_case. Filas
    públicas; **nunca** `api_key_enc`.
  - `GET /api/router/routes` → `{ routes }` con `fallback_chain` parseado a
    `{ provider, model }[]`.
  - `PATCH /api/router/providers/:id` body `{ status: "active" | "disabled" }`
    (id numérico).
  - `PUT /api/router/routes/:alias` body `{ fallback_chain: hops }` (upsert).
- Handlers en `backend/src/api/router-dashboard.ts`, separados del `/v1` público
  (`backend/src/api/router.ts`). No se tocó `packages/router/src/router.ts`.
- Robustez: `decodeAlias` con try/catch para que un `%` en el alias no lance
  `URIError`; JSON malformado en `fallback_chain` → hops vacíos, no 500.
- Frontend `/router`: tablas densas SAO (routes + providers), filtro de búsqueda,
  status persistido del provider, nota `no live probe — stored provider status`.
  La UI es **solo lectura** (no llama PATCH/PUT). Esos endpoints existen para
  completar el v1 de la API.
- Settings: el placeholder MODEL ROUTER se reemplaza por el link `open router →`.
  Nav del layout: Router después de Tasks. Keys siguen en `/keys`.
- Fuera de este slice: Fusion/MoA, health cron, mutación desde la UI.

DB live (`cardinal-backend` `/data/cardinal.db`) ya tiene provider `mock-local`
(active, cost 0) y alias `fast` → `mock-local/test-model`.

## Por qué

El router y el key factory ya estaban en producción local (`/v1/chat/completions`,
`/keys`). Settings seguía con un placeholder MODEL ROUTER; no había superficie
operativa para ver aliases, hops y estado de providers sin SQL. Este slice cierra
ese hueco con el mismo auth JWT del resto del dashboard.

## Decisiones

- JWT cookie **solo**, mismo patrón que `/api/keys`. No dual-auth con
  `sk-cardinal-*`: configurar providers/rutas es operación de admin, no de agente.
- Handlers en archivo propio (`router-dashboard.ts`), no mezclar con el `/v1`
  público de completions. El core de routing en `packages/router` no cambia.
- Responses en snake_case (filas públicas), alineadas a las columnas de DB, no al
  camelCase de `/api/keys`.
- `PATCH` por id numérico; `PUT` por alias (upsert). Status de provider es
  `active` | `disabled` persistido — no hay probe live ni cron de health.
- UI read-only: GET basta para operar visualmente; PATCH/PUT quedan para
  clientes/API, no para esta pantalla.
- `decodeAlias` fail-safe y parse de `fallback_chain` fail-soft (hops `[]`) para
  no 500 ante `%` crudo o JSON corrupto. Standard review HIGH sobre double-decode
  y parse: corregidos.
- Keys no se mezclan en `/router`; viven en `/keys`.

## Alternativas consideradas

- **Dual-auth JWT o agent Bearer:** rechazado. Un agente con key no debe mutar
  providers ni rutas. El dashboard de keys ya estableció el patrón JWT-only para
  administración.
- **Mutar desde la UI (PATCH/PUT):** diferido. Completar el v1 de la API no exige
  formularios en este slice; la pantalla operativa es de lectura.
- **Probe live / health cron:** fuera de alcance. El status es el persistido
  en DB.
- **Editor Fusion en `/router`:** diferido al unificar con
  [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md). GET parsea
  solo arrays; un objeto Fusion se muestra como hops vacíos.
- **Reusar `backend/src/api/router.ts`:** rechazado. Ese archivo es el wire
  público `/v1` (Bearer). Mezclar dashboard JWT ahí acopla dos superficies.

## Archivos

- Creados: `backend/src/api/router-dashboard.ts`,
  `backend/src/api/router-dashboard.test.ts`, `frontend/src/pages/Router.tsx`,
  `docs/features/2026-09-03-router-dashboard.md`.
- Modificados: `backend/src/server.ts`, `backend/src/server.test.ts`,
  `frontend/src/App.tsx`, `frontend/src/components/Layout.tsx`,
  `frontend/src/lib/types.ts`, `frontend/src/pages/Settings.tsx`,
  `docs/roadmap/fase-2.md`,
  `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`.
- No tocados: `packages/router/src/router.ts`, `backend/src/api/router.ts`
  (handlers `/v1`), `package.json` (sin bump).

## Verificación

- Padre: `bun test backend/src/api/router-dashboard.test.ts backend/src/server.test.ts`
  → **42 pass / 0 fail** (slice).
- Suite unificada (padre, 2026-09-03): **417 pass / 0 fail**; frontend build exit 0.
- Security review: sin findings confirmados.
- Standard review HIGH (double-decode y parse): corregidos antes de este doc.

## Relacionado

Índice: [`2026-09-03-router-surface.md`](./2026-09-03-router-surface.md).
Keys create: [`2026-09-03-key-create-limits.md`](./2026-09-03-key-create-limits.md).
Fusion: [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md).
Version: **0.2.5**.
