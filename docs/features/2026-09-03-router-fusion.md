# Mixture of Agents / Fusion en `@cardinal/router` (2026-09-03)

Pilar 2 de Cardinal v2. El cliente pide el modelo virtual `fusion` (o un alias
cuyo `fallback_chain` es un objeto JSON con `"mode":"fusion"`). El router
dispara N proposers en paralelo y un judge barato sintetiza **una** completion
con forma OpenAI. No es failover secuencial: ese path sigue existiendo.

## Qué se hizo

- Dispatch de Fusion en `packages/router` **después** de auth, scope, budget de
  tokens y pre-check USD/expiry de `routeCompletion`. Trigger:
  `request.model === "fusion"` **o** la ruta JSON tiene `mode === "fusion"`.
- Fan-out de proposers con `Promise.allSettled`. Drafts 2xx con
  `choices[0].message.content` string van al judge. Fallos parciales: solo los
  drafts buenos. Si **todos** los proposers fallan → `all_providers_failed`
  (HTTP 502) con `attempts`; el judge **no** se llama.
- El judge recibe los mensajes originales más un turno user
  `Synthesize a single answer from these proposer drafts:` y responde una
  completion OpenAI. El campo `model` de la respuesta se reescribe al alias
  pedido (`fusion` o `mix`).
- Mismo endpoint: `POST /v1/chat/completions`. v1 **no** streamea Fusion.
- Config en la columna existente `model_routes.fallback_chain` como **objeto**
  JSON (sin migración). Arrays de hops siguen siendo failover secuencial.

Config canónica:

```json
{
  "mode": "fusion",
  "panel": [
    { "provider": "p1", "model": "m1" },
    { "provider": "p2", "model": "m2" }
  ],
  "judge": { "provider": "judge-p", "model": "judge-m" },
  "strategy": "synthesize"
}
```

`panel[]` y `judge` pueden ser string (id de modelo: se resuelve al primer hop
activo). `upsertModelRoute` sigue aceptando **solo** arrays de hops; una ruta
Fusion se siembra con SQL / INSERT directo del objeto JSON.

Errores nuevos (mapeo HTTP en `backend/src/api/router.ts`):

| Código | HTTP | Cuándo |
|--------|------|--------|
| `fusion_not_configured` | 400 | Panel/judge ausente o inválido (o alias `fusion` sin ruta) |
| `fusion_streaming_unsupported` | 400 | `stream: true` |
| `fusion_strategy_unsupported` | 501 | `strategy: "best_of"` (v1 solo `synthesize`) |

Scopes: la key debe incluir `fusion` (o el alias pedido) o `*`. Se chequea
contra `request.model` **antes** del dispatch.

Metering: `consumeBudget` + `usage_log` por cada hop 2xx exitoso (N proposers +
1 judge). Hops fallidos no se meteren. Si los proposers agotan el budget de
tokens y revocan la key, el judge **no** se llama (`budget_exceeded`) — no se
gastan más llamadas a provider después del revoke.

USD/expiry: el pre-loop de card-keys en `routeCompletion` (`findActiveKeyByHash`
para `expires_at`; `budget_usd_limit` ya gastado → 402) corre **antes** del
dispatch Fusion. El meter de hops en `fusion.ts` es un duplicado del de tokens
de sequential y **no** incrementa USD. El USD hop-level no forma parte de este
feature.

UI: ninguna. `frontend/src/pages/Router.tsx` existe (dashboard JWT de routes
secuenciales); las rutas Fusion no se editan ahí.

## Por qué

El router ya hacía failover secuencial (un hop, si falla el siguiente). Mixture
of Agents pide otra semántica: varios drafts en paralelo y una síntesis, no
“el primero que responda”. Reusar `fallback_chain` como objeto evita migración y
deja el alias (`fusion`, `mix`, …) como source of truth compartible — el
cliente pide un modelo virtual, no configura el panel en el body.

## Decisiones

- Config en `fallback_chain` como objeto JSON vs columnas nuevas: sin
  migración. Arrays puros = sequential; objeto con `mode: "fusion"` = Fusion.
- Fan-out + judge vs failover: dos paths distintos. Sequential no cambia.
- `stream: true` → 400 explícito, no se ignora el flag ni se responde JSON
  silencioso.
- `best_of` → 501, no implementado. v1 solo `synthesize`.
- Helpers duplicados en `fusion.ts` (`meterSuccess`, parse de usage, rewrite de
  `model`) para no importar `router.ts` (ciclo).
- Abort del judge si el meter de proposers revocó la key por budget de tokens.
- Seed Fusion fuera de `upsertModelRoute` (sigue tipado a hop arrays).
- Tests de Fusion mockean el upstream en puerto **18998**; sequential sigue en
  **18999**.

## Alternativas consideradas

- **Columna `kind` en `model_routes`:** rechazada. Migración extra para un
  discriminador que el JSON ya expresa con `mode`.
- **Config extra en el body del request, sin DB:** menos compartible. El alias
  en DB es la source of truth; config por request no entra en v1.
- **Ignorar `stream: true` y devolver JSON:** rechazado. 400 explícito
  (`fusion_streaming_unsupported`) para no fingir SSE.
- **Editor Fusion en el dashboard `/router`:** diferido. La UI de routes es
  sequential; Fusion se siembra por SQL.

## Archivos

- Creados: `packages/router/src/fusion.ts`,
  `packages/router/src/fusion.test.ts`.
- Modificados: `packages/router/src/router.ts` (dispatch tras
  auth/scope/budget/usd), `packages/router/src/error.ts`,
  `backend/src/api/router.ts` (mapeo 400/501).
- Docs: `docs/features/2026-09-03-router-fusion.md`. Puntero de una línea en
  `docs/roadmap/fase-2.md` y `docs/guides/router-usage.md`.
- No tocados: `frontend/src/pages/Router.tsx`, `package.json` (sin bump),
  SOULs.

## Verificación

- Padre: `bun test packages/router` → **22 pass / 0 fail** (11 Fusion + 11
  sequential, incluyendo tests de card-keys USD/expiry).
- Suite unificada (padre, 2026-09-03): **417 pass / 0 fail**.

## Relacionado

Índice: [`2026-09-03-router-surface.md`](./2026-09-03-router-surface.md).
Dashboard: [`2026-09-03-router-dashboard.md`](./2026-09-03-router-dashboard.md).
Keys: [`2026-09-03-key-create-limits.md`](./2026-09-03-key-create-limits.md).
Version: **0.2.5**.
