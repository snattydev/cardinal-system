# Sprint Log — Superficie Router (dashboard + keys + fusion), 2026-09-03

> Tres Cursor agents en paralelo, tab Background del workspace Herdr
> `cardinal-system` (`w4:t8`). Padre: Composer en Work. Sin commit en los
> agentes. Unificación y docs: padre, mismo día.

## Resumen ejecutivo

Cierra el hueco operativo del pilar 2 (pool/router) que quedó después del
sprint 20–21/08 (motor + `/keys` list/revoke):

- **Dashboard `/router`** — tabla SAO de aliases/providers; API JWT de
  lectura + mutación (la UI no muta).
- **Create de keys** — `POST /api/keys` + form: tokens, scopes, expiración,
  tope USD. Enforcement en el router.
- **Fusion / MoA** — modelo virtual `fusion`: N proposers en paralelo +
  judge `synthesize`. Failover secuencial intacto.

Inspiración: FreeLLMAPI (tabla operativa, Fusion). No se copia key unificada,
catálogo público ni Premium.

**Versión:** 0.2.4 (mailbox MCP, mismo working tree) → **0.2.5** este sprint.

## Timeline

| Hora (aprox.) | Quién | Qué |
|---------------|-------|-----|
| 01:33 | Padre | Estado del router local (motor ✅, UI no, MoA no) |
| 01:39 | Padre | Confirmación: router vive en `cardinal-backend` |
| 01:47 | Padre | Scope: las tres features, una sesión Cursor cada una, Herdr Background |
| 01:49 | orquestador | Split `w4:pK` → `w4:pM` → `w4:pN`; start tres workers en Background |
| ~02:27 | Tres Cursor | `idle`; no notificaron al padre |
| 02:27 | Padre | Lectura de panes + suite unificada **417 pass / 0 fail**, frontend build OK |
| 02:30 | Padre | Unificación docs + bump 0.2.5 |

## Agentes (Herdr Background `w4:t8`)

| pane | descripción | tipo | DoD |
|------|-------------|------|-----|
| `w4:pK` | Router UI | cursor | `/router` + JWT `/api/router/*` |
| `w4:pM` | Keys Factory | cursor | `POST /api/keys` + expiry/USD |
| `w4:pN` | Fusion MoA | cursor | `fusion.ts` + dispatch |

Ownership: dashboard no tocó `packages/router/src/router.ts`; keys solo
pre-loop auth/budget; Fusion en `fusion.ts` + ~10 líneas de dispatch.

## Números

- Suite unificada padre: **417 pass / 0 fail**, 23 files, ~4s
- Frontend `bun run build`: Vite 8.1.5, **exit 0**
- Feature docs: 3 slices + 1 índice
- Version: `package.json` **0.2.5**

## Docs de feature

- [`docs/features/2026-09-03-router-surface.md`](../features/2026-09-03-router-surface.md) — índice
- [`docs/features/2026-09-03-router-dashboard.md`](../features/2026-09-03-router-dashboard.md)
- [`docs/features/2026-09-03-key-create-limits.md`](../features/2026-09-03-key-create-limits.md)
- [`docs/features/2026-09-03-router-fusion.md`](../features/2026-09-03-router-fusion.md)

## Estado al cierre

- Working tree unificado, **sin commit** (el humano lo pide).
- Frontend Vite en `:5173` (lo levantó `card-router-ui`); backend ya estaba up.
- Huecos: UI `/router` read-only y ciega a JSON Fusion; seed Fusion por SQL;
  USD hop-level en Fusion; backlog #5 (e2e zen), #11 (bootstrap password),
  #10 (PR `dev→main`), #13 (one-shot keys).

## Lecciones

1. Tres features en el mismo tree funcionan si el ownership de archivos es
   explícito en el prompt. El único punto compartido (`router.ts` pre-loop +
   dispatch) se resolvió sin conflicto de merge.
2. Los agentes Background no avisaron al padre al pasar a `idle`. Hay que
   leer `herdr agent list` / `herdr agent read` y verificar en el padre.
3. Cada slice corrió su subset de tests; la verdad es la suite unificada.
