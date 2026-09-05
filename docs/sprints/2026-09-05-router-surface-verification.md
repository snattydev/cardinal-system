# Verificación — Superficie Router v0.2.5 (2026-09-05)

> Verificación independiente, en VM limpia (Cloud Agent), del estado de `dev`
> en `e837552` contra lo que declaran el roadmap, el sprint del 2026-09-03 y los
> cuatro feature docs. Sin cambios de código. Solo lectura + ejecución.
>
> Sprint verificado: [`2026-09-03-router-surface.md`](./2026-09-03-router-surface.md).
> Índice de features: [`../features/2026-09-03-router-surface.md`](../features/2026-09-03-router-surface.md).

## Veredicto

`dev` v0.2.5 es **coherente** con la documentación. Todo lo que el sprint
declara (dashboard `/router`, create de keys con expiry/USD, Fusion/MoA, mailbox
MCP) existe, se comporta como está escrito, y los huecos documentados son
exactamente los huecos encontrados. Se hallaron **un problema de entorno**, **un
bug chico de metering USD** y varias incoherencias LOW (abajo).

## Coherencia docs ↔ código

| Fuente | Declara | Real |
|--------|---------|------|
| `package.json` | `0.2.5` | ✅ `/api/health`, `/api/system`, footer sidebar y Settings dicen `0.2.5` |
| Sprint 2026-09-03 | 417 pass / 0 fail, build exit 0 | ✅ **417 pass / 0 fail** (23 files), `bun run build` exit 0, `bun run typecheck` exit 0 |
| `roadmap.md` / `fase-2.md` / `README.md` | Fase 2 en curso, pilares 1–4 ✅ salvo spike-003 | ✅ mutuamente consistentes; mismos pendientes (#5, #10, #13, UI Fusion, USD hop-level) |
| `router-dashboard.md` | JWT-only, sin `api_key_enc`, Fusion como hops `—`, `%` no 500 | ✅ todo verificado en vivo |
| `key-create-limits.md` | 400 `agent_not_found` / `invalid_payload`, plaintext una vez, 401 expiry, 402 USD | ✅ todo verificado en vivo |
| `router-fusion.md` | N proposers + judge, `model` reescrito, `stream` 400, `best_of` 501, sin USD en Fusion | ✅ 3 llamadas upstream (2 + judge); `fusion.ts` no meterea USD (documentado) |
| `mcp-mailbox-tools.md` | 9 tools, identidad = key | ✅ `tools/list` = memory + board + mailbox; `from_agent` forzado a la key |
| `2026-08-24-cloud-agent-environment.md` | `typecheck` falla por `maxPayloadLength` | ❌ **stale**: hoy pasa (la opción vive dentro de `websocket:`) |

## Qué se ejecutó

Stack completo en la VM: backend `:8787`, Vite `:5173`, MCP hub `:8789`, cliente
WS de referencia (`examples/ws-agent.ts`) y un upstream mock OpenAI-compatible
(fuera del repo, en `/tmp`) que loguea cada request. DB sembrada con 4
providers, aliases secuenciales, y filas Fusion insertadas como objeto JSON
(como indica la guía).

1. **Suite automatizada:** `bun test --timeout 30000 packages/*/src backend/src`,
   `bun run build`, `bun run typecheck`.
2. **API end-to-end (59 checks, 59 pass):**
   - Auth JWT: login 200/401, `/api/keys` y `/api/router/*` 401 sin cookie.
   - `/api/router/*`: providers sin `api_key_enc`; `fast` con 2 hops; `fusion`
     como `fallback_chain: []`; PATCH/PUT con validación; alias con `%` crudo → 200.
   - `/v1/models`; `/v1/chat/completions` 401 sin/mala key; alias secuencial
     con `model` reescrito y key de provider descifrada en el upstream;
     failover tras 500 y **cooldown de 60s** del provider; `model_not_found` 404.
   - Fusion: judge recibe el turno `Synthesize a single answer…`, respuesta con
     `model: "fusion"`, 3 llamadas upstream; `stream:true` → 400; `best_of` → 501.
   - Key factory: `agent_not_found`, expiry pasado y USD negativo → 400;
     plaintext solo en el create; scope → 403; USD `0 → 3 → 6` y al tope → **402**;
     expiry → **401**; revoke 200 / 409 / 401.
   - Blackboard + mailbox dual-auth: create/claim/complete, `not_open` 409,
     `from_agent` forzado a la identidad de la key, inbox por `to_agent`.
3. **MCP hub:** 401 sin key, `initialize`, `tools/list` (9 tools),
   `cardinal_task_list`, `cardinal_agent_inbox`, `cardinal_list_memory`.
4. **WS:** agente `shinon` `connected: true` en `/api/agents` y en el Hub.
5. **UI (grabado):** login → Overview → Agents Hub → Keys (create con scopes,
   tokens, expiry, USD; banner plaintext + copy) → Tasks (create/claimar/completar)
   → Router (tablas + filtro) → Settings (`open router →`) → Router.

## Hallazgos

| # | Severidad | Hallazgo | Dónde |
|---|-----------|----------|-------|
| 1 | **Entorno** | El build del entorno Cloud Agent se tomó de `main`, cuyo `.cursor/start.sh` no genera `POOL_SECRET`. En boot, `start` y la terminal `backend` corren contra ese checkout antes del switch a `dev`; el backend muere con `POOL_SECRET is required`. El fix ya está en `dev` (`cfa38bc`, `append_pool_secret_if_missing`); se resuelve con el PR `dev → main` (#10) o rebuild del entorno desde `dev`. Workaround: re-correr `bash .cursor/start.sh` y reiniciar la terminal. | `.cursor/start.sh` |
| 2 | LOW/MEDIUM | **Float edge en tope USD.** `(30/1e6)*1000 = 0.030000000000000002`; una llamada que cuesta exactamente el tope falla `used + usd <= limit`, se trata como overshoot, **revoca la key y deja `budget_usd_used` en 0**. Redondear el incremento (o micro-USD entero) lo evita. | `packages/router/src/router.ts` `meterSuccess`, `packages/db/src/repos.ts` `consumeBudgetUsd` |
| 3 | LOW | **Keys expiradas se listan como activas.** `listHumanKeys` y el count `keys_active` solo miran `revoked_at`; una key vencida sigue en `/keys` y en los contadores de Overview/Settings con `exp …` pasado, aunque el router ya la rechaza (401). | `packages/db/src/repos.ts`, `backend/src/api/system.ts`, `frontend/src/pages/Keys.tsx` |
| 4 | LOW (UX) | Form `/keys`: un `datetime-local` incompleto se descarta en silencio → `exp ∞`. Con valor completo funciona. | `frontend/src/pages/Keys.tsx` |
| 5 | LOW (docs) | Nota stale sobre `typecheck` fallando por `maxPayloadLength`. | `docs/features/2026-08-24-cloud-agent-environment.md` |
| 6 | Nota de diseño | Un 429/5xx de **un** modelo pone a **todo** el provider en cooldown 60s (documentado en `router-usage.md` §troubleshooting), pero `/router` lo sigue mostrando `active` ("no live probe"). Consistente con el hueco conocido; recordarlo al leer la tabla. | `packages/router/src/router.ts`, `frontend/src/pages/Router.tsx` |
| 7 | Cosmético | `serverInfo.version` del MCP y todos los `packages/*/package.json` dicen `0.1.0`; el source of truth declarado es el `package.json` raíz. | `packages/mcp/src/server.ts` |

## Decisiones de la verificación

- Upstream mock y seeds **fuera del repo** (`/tmp`): la verificación no deja
  archivos ni cambios en el working tree.
- El tope USD se probó con `cost_per_mtok = 100000` (3 USD exactos por llamada
  de 30 tokens) para separar el path 402 del bug de float (#2), que se
  reprodujo aparte con `cost_per_mtok = 1000` y tope `0.03`.
- Cooldown: el test de failover se corrió **último** porque el 500 deja a
  `mock-a` 60s fuera y contamina cualquier check posterior sobre ese provider.

## Follow-ups sugeridos (no hechos en este doc)

- #2: redondeo del incremento USD (p. ej. `Math.round(usd * 1e9) / 1e9`) o
  micro-USD entero en `consumeBudgetUsd`; test RED con `(30/1e6)*1000` y tope `0.03`.
- #3: filtrar `expires_at` pasado en `listHumanKeys("active")` y en los counts, o
  marcar `expired` en la UI.
- #4: validación mínima del `datetime-local` en el form (error visible).
- #5: actualizar la nota de `typecheck` en el doc de entorno.
- #1: priorizar el PR `dev → main` (#10) para que el entorno Cloud Agent bootee
  con el `start.sh` correcto.

## Archivos

- Creados: `docs/sprints/2026-09-05-router-surface-verification.md`.
- Modificados: `docs/sprints/2026-09-03-router-surface.md` (puntero),
  `docs/roadmap/fase-2.md` (puntero).
- Código: **ninguno**.
