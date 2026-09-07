# Catálogo vivo + modelo obligatorio al crear la key (2026-09-07)

Cierra el flujo operativo del pilar 2: pegar un provider real, descubrir sus
modelos, y crear una `sk-cardinal-*` scoped a un id confirmado (modelo, alias
o Fusion).

## Qué se hizo

- **Discover** (`packages/router/src/discover.ts`): `GET …/models` según
  `wire_format` (OpenAI / Anthropic / Gemini). El alta
  (`POST /api/router/providers`) ya no acepta `models[]` a mano: fetch +
  `replaceProviderModels`. Si el fetch falla o vuelve vacío, rollback del
  provider (502).
- **PATCH** de provider: `base_url`, `wire_format`, `cost_per_mtok`,
  `api_key`, `status`, `sync_models`. Re-fetch si cambia URL, wire, key o
  `sync_models: true`.
- **POST** `/api/router/providers/:id/sync-models` y **DELETE** del provider.
- **GET** `/api/router/catalog` (cookie JWT): `{ items: [{ id, kind }] }` con
  `kind` `model` | `alias` | `fusion`. Solo providers `active`. Un `model_id`
  en N providers = una fila. Un alias que choca con un modelo queda
  `kind: "model"`.
- **UI `/keys`**: el input de scopes (default `*`) se reemplaza por un
  searcher. Obligatorio elegir un id. Submit manda `scopes: [id]`. Catálogo
  vacío → no se puede crear. CLI/`POST` siguen aceptando `*` y scopes libres.

## Por qué

Sin catálogo real la key se creaba con `*` o un string a mano, y el alta de
provider pedía CSV de modelos. Para usar OpenRouter/Groq de verdad hacía
falta seed CLI. El searcher obliga a un scope que el router puede resolver.

## Decisiones

- Endpoint JWT propio (`/api/router/catalog`) en vez de unir
  providers+routes en el cliente (Fusion se veía como hops vacíos) o reusar
  `GET /v1/models` (público, sin `kind`).
- Un modelo obligatorio en la UI. `*` y multi-scope quedan en backlog (#26).
- `handleCreateKey` no valida contra el catálogo: no romper keygen ni tests.
- Discover al alta, no CSV. Si el upstream no lista modelos, no queda un
  provider ciego.

## Alternativas consideradas

- **Unir GET providers + GET routes en el cliente:** rechazado. Fusion no
  aparece en routes.
- **Reusar GET /v1/models:** rechazado. Sin `kind`, sin cookie JWT.
- **Validar URL/key en el alta (formato + probe extra):** backlog #21. El
  fetch de modelos ya hace de probe mínimo.

## Backlog anotado (no este slice)

Items **19–28** en
[`docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`](../superpowers/plans/2026-08-17-cardinal-v2-backlog.md):
ruido visual de modelos/cost en `/router`, validación URL/key, editor de
cadenas y Fusion, USD/stream Fusion, `*` en keys, aliases colgantes al
DELETE, rpm/tpm.

## Archivos

- Creados: `packages/router/src/discover.ts`,
  `packages/router/src/discover.test.ts`,
  `docs/features/2026-09-07-router-catalog-key-scope.md`.
- Modificados: `packages/router/src/index.ts`, `packages/db/src/repos.ts`,
  `packages/db/src/index.ts`, `backend/src/api/router-dashboard.ts`,
  `backend/src/api/router-dashboard.test.ts`, `backend/src/server.ts`,
  `backend/src/server.test.ts`, `frontend/src/pages/Router.tsx`,
  `frontend/src/pages/Keys.tsx`, `frontend/src/lib/types.ts`,
  `docs/guides/router-usage.md`, `docs/roadmap.md`,
  `docs/roadmap/fase-2.md`,
  `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`,
  `package.json`.

## Verificación

- `bun test --timeout 30000 packages/*/src backend/src` → **457 pass / 0 fail**
- `bun run build` (frontend/) → Vite 8.1.5, **exit 0**
