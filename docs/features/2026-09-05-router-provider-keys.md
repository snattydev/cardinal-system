# Alta de provider keys desde `/router` + nav Keys bajo Router (2026-09-05)

Follow-up del dashboard JWT de Pilar 2. El catálogo `/router` dejaba de ser
solo lectura: se pueden cargar API keys de providers (OpenRouter, Groq, etc.)
sin el CLI de seed. Keys de agente (`sk-cardinal-*`) se mueven al dropdown de
Router.

## Qué se hizo

- `POST /api/router/providers` (cookie JWT, no Bearer de agente):
  body `{ name, base_url, api_key, models[], wire_format?, cost_per_mtok? }`.
  Upsert por `name`. `api_key` se cifra con `encryptSecret` / `POOL_SECRET`
  (AES-256-GCM) y se guarda en `api_key_enc`. La respuesta es
  `{ provider, models }` vía `toPublicProvider`: **nunca** `api_key` ni
  `api_key_enc`.
- UI `/router`: formulario ADD PROVIDER KEY (name, base url, api key password,
  models CSV, wire format, cost/mtok). Tras guardar, el input de key se limpia
  y el catálogo se recarga.
- Nav: dropdown **Router** → Catalog (`/router`) + Keys (`/keys`). Agents
  vuelve a ser un link directo (Hub era el único hijo).
- Tests TDD en `router-dashboard.test.ts` + `server.test.ts` (401 sin cookie,
  200 con sesión, leak del plaintext, rotación por upsert).

## Por qué

En el test manual el dashboard mostraba providers pero no había forma de
pegar una API key de upstream. El seed CLI cubría el happy path de e2e, no
el uso diario. Keys de agente vivían bajo Agents aunque son identidad del
router.

## Decisiones

- JWT cookie **solo**, igual que el resto del dashboard de router. Un agente
  con `sk-cardinal-*` no debe escribir providers.
- Upsert por `name` (mismo que el CLI): reenviar el form rota la key cifrada
  y agrega modelos; no hay delete en este slice.
- `models` es array de strings no vacíos, al menos uno. La UI parte CSV.
- Input `type=password` + `autoComplete=off`; el plaintext solo viaja en el
  POST y no se pinta de vuelta.
- Agents sin dropdown de un solo ítem: menos clic para el roster.

## Alternativas consideradas

- **Seguir solo con `seed-provider` / `seed-router.ts`:** rechazado. El test
  manual pidió el alta desde la UI.
- **Create-only (409 si el name existe):** rechazado. Rotar una key de
  OpenRouter es el caso de uso; el CLI ya era upsert.
- **Meter Keys en la misma página `/router`:** rechazado. Son dos recursos
  (provider credentials vs `sk-cardinal-*`). El dropdown los agrupa.

## Archivos

- Modificados: `backend/src/api/router-dashboard.ts`,
  `backend/src/api/router-dashboard.test.ts`, `backend/src/server.ts`,
  `backend/src/server.test.ts`, `frontend/src/pages/Router.tsx`,
  `frontend/src/components/Layout.tsx`, `docs/guides/router-usage.md`.
- Creados: `docs/features/2026-09-05-router-provider-keys.md`.

## Verificación

- `bun test` → **423 pass / 0 fail**.
- `bun run build` (frontend/) → exit 0.
- Security review (uncommitted): CRITICAL/HIGH/LOW none.
