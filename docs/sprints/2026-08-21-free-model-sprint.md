# Sprint Log — Modelo Gratis (Router + Keys), 20–21/08/2026

> Registro del sprint de desarrollo con modelos gratis (OpenCode Zen / Ox Alpha).
> Datos reales extraídos del historial de git de `dev` (no pushed aún: dev está ahead 8).

## Resumen ejecutivo

Sprint de ~17h reloj (20/08 07:09 → 21/08 00:49) que llevó el LLM Router de
Cardinal v2 de arquitectura cerrada a sistema funcionando con dashboard:

- **Router provider-agnostic** con fallback chain, SSE streaming y metering
- **Key Factory**: scopes, budget enforcement, encriptación de providers
- **Dashboard /keys**: listar + revocar keys persistentes (API + UI)
- **Docs**: manual de uso del router, feature docs, version bump 0.2.2

Todo el código fue escrito por workers de coding con modelos gratis
(Ox Alpha / DeepSeek V4 free tier), orquestados vía herdr.

## Timeline (commits reales en dev)

| Hora | Commit | Qué |
|------|--------|-----|
| 20/08 07:09 | e060df5 | docs(roadmap): cerrar arquitectura del router provider-agnostic |
| 20/08 07:09 | 6b8bf61 | feat(keys): key factory con scopes, budget y encriptación de providers |
| 20/08 07:09 | e8ad0b8 | feat(router): LLM router provider-agnostic con failover transparente |
| 20/08 07:13 | 076cf02 | docs(router): manual de uso del LLM router |
| 20/08 13:48 | 643adf0 | chore(dev): roles OpenCode apuntan a docs canónicos |
| 20/08 13:50 | 1b5c404 | docs: feature doc Cursor subagents |
| 20/08 13:51 | 21a2154 | docs: plan Cursor subagents |
| 20/08 13:58 | ddbf208 | fix(agents): role output en último mensaje, no en el doc |
| 21/08 00:27 | 68de60e | feat(db): list y revoke human keys por id |
| 21/08 00:29 | a3ec86e | feat(api): handlers JWT keys list + revoke-by-id |
| 21/08 00:32 | 38b85a6 | feat(api): /api/keys detrás de cookie de sesión JWT |
| 21/08 00:35 | 3107931 | feat(ui): página /keys para listar y revocar |
| 21/08 00:38 | 515e85d | fix(ui): key recién revocada queda en historial abierto |
| 21/08 00:40 | c00214a | fix(ui): usar estado actual de history-open en revoke |
| 21/08 00:43 | 36d1969 | docs(keys): doc /keys dashboard + bump 0.2.2 |
| 21/08 00:49 | e003aae | fix(ui): no mostrar estado vacío de keys en load/error |

## Números del sprint

- **16 commits** en dev (8 sin push — ahead de origin/dev)
- **~3.900 líneas** agregadas netas (1622 en la ventana origin/dev..dev +
  ~2.000 del bloque router/keys del 20/08)
- **3 features mayores**: router, key factory, keys dashboard
- **TDD respetado**: cada capa con su suite (router.test 205 líneas,
  router API test 254, db.test +297, keys.test 122, server.test +15)
- **Version**: 0.2.1 → 0.2.2

## Stack de modelos usado

| Rol | Modelo | Proveedor |
|-----|--------|-----------|
| Implementación | Ox Alpha Free / DeepSeek V4 Flash (free tier) | OpenCode Zen / Go |
| Orquestación | Hermes (sesión engineer) | Nous Research |
| Revisión | Fresh-context review por item | — |

## Estado al cierre

- `dev` estable, ahead 8 de origin/dev — pendiente push por Santi
- Item #13 (one-shot keys) diferido: depende de pipeline one-shot
- Item #5 (seed + e2e zen free real) en curso al cierre del log
- Próximo PR dev→main cuando Santi valide

## Lecciones del sprint

1. **Modelos gratis alcanzan para backend TDD-able**: router y keys pasaron
   gates de verificación real sin necesidad de modelos pagos.
2. **Failover transparente funciona en diseño**: el router resuelve por nombre
   de modelo o alias y degrada entre providers sin exponer el corte.
3. **El cuello de botella no fue el modelo**: fue la infraestructura de
   verificación (podman, mock upstream, proxy :4010 pendiente).
