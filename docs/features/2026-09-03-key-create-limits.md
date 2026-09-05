# Key create + expiry/USD limits (2026-09-03)

Dashboard `/keys` ahora crea keys persistentes (`sk-cardinal-*`) con scopes,
budget de tokens, expiración y tope USD. El router respeta expiry y USD. El
plaintext se muestra una sola vez.

## Qué se hizo

La página protegida `/keys` deja de ser solo listar/revocar: ahora crea keys
persistentes con scopes, límite de tokens, fecha de expiración y tope USD. El
plaintext (`sk-cardinal-*`) se muestra una sola vez en un banner con copy; no
vuelve a aparecer en el listado.

La API JWT agrega `POST /api/keys` (misma cookie que `GET`). El body es
`{ agentName, scopes?, budgetLimit?, expiresAt?, budgetUsdLimit? }`. Responde
200 `{ key: plaintext, item: KeyItem }` o 400 `agent_not_found` /
`invalid_payload`. `created_by=human`. Un `expiresAt` pasado o no parseable
es 400. A diferencia del CLI `keygen`, el endpoint **no** registra el agente:
si no existe, 400.

`KeyItem` (camelCase) suma `expiresAt`, `budgetUsdLimit` y `budgetUsdUsed`.

Schema: migración 14 en `agent_keys` agrega `expires_at TEXT NULL`,
`budget_usd_limit REAL NULL` y `budget_usd_used REAL NOT NULL DEFAULT 0`.
`createAgentKey` acepta `expiresAt` / `budgetUsdLimit`.
`findActiveKeyByHash` rechaza `expires_at` pasado (`Date.parse <= now`) además
de revoked. `consumeBudgetUsd` solo incrementa si hay límite; falla si el
incremento excedería el tope; no incrementa si el límite es null.

El router, antes del loop de hops: key expirada → `unauthorized`;
`budget_usd_used >= budget_usd_limit` → `budget_exceeded` (HTTP 402 ya
existía). Metering USD: `(totalTokens/1e6)*hop.costPerMtok`. Costo 0 no
incrementa; sin límite USD no incrementa. Overshoot USD (`consumeBudgetUsd`
false) revoca la key, espejo del overshoot de tokens.

UI: form (agente + datalist del roster, scopes separados por coma, tokens,
datetime-local, USD), banner de plaintext + copy, filas con expiración y
USD used/limit.

El CLI `bun run keygen` sigue existiendo; no se reescribió.

## Por qué

El spec 2026-08-20 dejó create fuera a propósito (CLI only): el plaintext se
imprime una sola vez y no había UI de creación. Ahora se pide create desde el
dashboard, con límites reales. Los tokens ya se enforceaban; expiry y USD no
existían en schema ni en el router. `providers.cost_per_mtok` ya estaba
(default 0) y no cortaba keys.

## Decisiones

- Create **no** pre-registra el agente: 400 si no existe. El CLI keygen sí lo
  hace. El dashboard opera sobre agentes conocidos.
- Response `{ key, item }` para no chocar con revoke `{ key: KeyItem }`.
- Expiry comparada en JS (`Date.parse`) porque SQLite `datetime('now')` no es
  ISO con T/Z.
- USD se suma solo si hay `budget_usd_limit`; `cost_per_mtok` 0 no mueve el
  used.
- Overshoot USD post-success revoca (como tokens), no deja fail-open.
- Sin página `/router` en este slice (la arma el dashboard). Sin Fusion.

## Alternativas consideradas

- **Pre-registrar el agente como keygen:** rechazado — el spec pide 400 si el
  agente no existe.
- **Filtrar expiradas en SQL vs JS:** JS, por el formato ISO del wire.
- **402 pre-flight estimando tokens:** imposible sin usage; se chequea
  `used >= limit` antes del loop y overshoot después.
- **Incluir plaintext en el listado:** no — una sola vez, en el banner de
  create.

## Archivos

- Creados: `docs/features/2026-09-03-key-create-limits.md`.
- Modificados: `packages/db/src/schema.ts`, `packages/db/src/repos.ts`,
  `packages/db/src/index.ts`, `packages/db/src/db.test.ts`,
  `packages/core/src/types.ts`, `packages/router/src/resolve.ts`,
  `packages/router/src/router.ts`, `packages/router/src/router.test.ts`,
  `backend/src/api/keys.ts`, `backend/src/api/keys.test.ts`,
  `backend/src/server.ts`, `backend/src/server.test.ts`,
  `frontend/src/pages/Keys.tsx`, `frontend/src/lib/types.ts` (`KeyItem`).
- Nota: el mapper de hop en Fusion recibió `costPerMtok` porque el tipo
  `ResolvedHop` lo exige; no es parte funcional de este slice.

## Verificación

- Slice: 146 pass en db + router + keys + server; frontend build exit 0.
- Suite unificada (padre, 2026-09-03): **417 pass / 0 fail**.

## Relacionado

Índice: [`2026-09-03-router-surface.md`](./2026-09-03-router-surface.md).
Dashboard `/router`: [`2026-09-03-router-dashboard.md`](./2026-09-03-router-dashboard.md).
Fusion: [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md).
Version: **0.2.5**.
