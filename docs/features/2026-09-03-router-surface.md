# Superficie Router v0.2.5 (dashboard + keys + fusion) (2026-09-03)

Tres slices en paralelo (Herdr Background, kind Cursor) sobre el pilar 2
(pool/router). Este doc es el índice unificado; el detalle de cada slice vive
en su feature doc.

| Slice | Agent | Doc |
|-------|-------|-----|
| Dashboard JWT `/router` | `card-router-ui` | [`2026-09-03-router-dashboard.md`](./2026-09-03-router-dashboard.md) |
| Create keys + expiry + USD | `card-keys` | [`2026-09-03-key-create-limits.md`](./2026-09-03-key-create-limits.md) |
| Fusion / MoA | `card-fusion` | [`2026-09-03-router-fusion.md`](./2026-09-03-router-fusion.md) |

Sprint: [`docs/sprints/2026-09-03-router-surface.md`](../sprints/2026-09-03-router-surface.md).

## Qué se hizo (vista única)

El router deja de ser solo `/v1` + CLI. Hay tres superficies que encajan:

1. **Operar el pool** — página `/router` (JWT, theme SAO, tablas). Lista
   providers/modelos/aliases. API `GET/PATCH/PUT /api/router/*`. La UI es
   read-only; PATCH/PUT existen para clientes.
2. **Identidad de cliente** — `/keys` crea `sk-cardinal-*` con scopes, budget
   de tokens, `expires_at` y tope USD. El router corta expiry (401) y USD
   (402) además del budget de tokens que ya existía.
3. **Fusion** — `POST /v1/chat/completions` con `model=fusion` (o un alias
   cuyo `fallback_chain` es `{"mode":"fusion",...}`) fanea N proposers y un
   judge sintetiza una completion. Failover secuencial no cambia.

Separación de responsabilidades (no mezclar):

| Superficie | Auth | Quién |
|------------|------|--------|
| `/v1/chat/completions`, `/v1/models` | Bearer `sk-cardinal-*` | agentes / apps |
| `/api/router/*`, `/router` | cookie JWT | admin dashboard |
| `/api/keys`, `/keys` | cookie JWT | admin dashboard |

## Por qué

El pool (v0.2.2) tenía motor y `/keys` de list/revoke, pero Settings seguía
con “MODEL ROUTER coming in Fase 2”, create de keys era CLI-only, y no había
Mixture of Agents. Santi pidió las tres features juntas, inspiradas en
FreeLLMAPI, sin clonar su key unificada ni el catálogo público.

## Decisiones (unificadas)

- Tres agentes, mismo working tree, ownership de archivos: dashboard no toca
  `packages/router/src/router.ts`; keys solo el pre-loop de auth/budget; Fusion
  vive en `fusion.ts` + un dispatch corto.
- Version bump **0.2.5** (0.2.4 quedó para mailbox MCP). En `dev` solo PATCH.
- Fusion no se edita en `/router` v1: `GET /api/router/routes` parsea
  `fallback_chain` como array; un objeto Fusion se muestra como hops vacíos
  (`—`). Seed por SQL. Follow-up.
- Metering USD de Fusion: el pre-check de tope corre antes del dispatch; el
  `meterSuccess` de `fusion.ts` no incrementa `budget_usd_used`. Follow-up.
- Sin commit en los agentes; el padre unifica docs y estado.

## Alternativas consideradas

- **Un solo agente, tres PRs seriales:** rechazado. Santi pidió una sesión
  Cursor por feature en Herdr Background.
- **Fusion como tab de primer nivel (FreeLLMAPI):** diferido. Cardinal tiene
  pocos providers; primero el dashboard de cadenas y el create de keys.
- **Key unificada estilo `freellmapi-…`:** rechazado. Rompe `sk-cardinal-*` +
  scopes por agente.

## Archivos (unión de los tres slices)

Ver cada feature doc. Este índice no duplica el listado.

## Verificación

Padre, suite unificada sobre el working tree combinado (2026-09-03):

- `bun test --timeout 30000 packages/*/src backend/src` → **417 pass / 0 fail**
- `bun run build` (frontend) → Vite 8.1.5, **exit 0**

## Huecos conocidos (no este bump)

- UI `/router` no llama PATCH/PUT; no muestra panel/judge de Fusion.
- `upsertModelRoute` y `PUT /api/router/routes/:alias` solo aceptan arrays
  (failover). Fusion se siembra con INSERT del objeto JSON.
- Fusion no meterea USD por hop; `best_of` y streaming Fusion = 400/501.
- Seed + e2e zen free real (backlog #5) y spike-003 opencode-go siguen abiertos.
- Item #13 one-shot keys: diferido.
