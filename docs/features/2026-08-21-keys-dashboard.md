# Keys Dashboard (2026-08-21)

Dashboard para listar y revocar keys persistentes de agentes.

## Qué se hizo

Se habilitó la página protegida `/keys` para listar keys activas creadas por
humanos y revocarlas individualmente. La API JWT expone `GET /api/keys`, su
variante de historial `?status=revoked`, y `POST /api/keys/:id/revoke`; sus
responses usan camelCase y no incluyen hashes ni plaintext.

La página agrega confirmación inline para revoke y deja las keys revocadas detrás
de un control mínimo con icono de log. También habilita el enlace Keys del
sidebar, enlaza la tarjeta Keys Active de Overview y reemplaza el placeholder de
Settings. Los contadores `keysActive` y `keysRevoked` ahora consideran solo keys
persistentes (`created_by=human`).

## Por qué

La CLI ya permitía administrar `agent_keys`, pero el dashboard mostraba Keys como
una capacidad futura. Este slice cierra ese hueco sin exponer secretos ni mezclar
las keys persistentes administradas por humanos con las keys one-shot del sistema.

## Decisiones

- Crear keys se mantiene en la CLI: el plaintext se imprime una sola vez y no se
  agrega una UI ni endpoint de creación.
- Revocar opera sobre un `id` individual, no sobre el nombre del agente, para no
  invalidar keys hermanas.
- El historial vive detrás de un icono de log, en vez de una segunda tabla siempre
  visible, para separar keys vivas de las revocadas.
- Los ids de keys `system` responden 404 al revocar: la API del dashboard nunca
  las muta ni las lista.
- `keysActive` y `keysRevoked` cuentan únicamente keys `human`, de modo que
  Overview y Settings reflejan la misma población que `/keys`.
- El bloque live one-shot y el hard-delete quedan fuera de este slice; pertenecen
  al futuro pipeline one-shot.

## Alternativas consideradas

- **Crear keys desde el dashboard:** descartado — aumentaría la superficie que
  puede mostrar plaintext y contradice el flujo de impresión única de la CLI.
- **Revocar por nombre de agente:** descartado — revocaría todas sus keys activas,
  cuando la acción del dashboard debe ser granular.
- **Mostrar las revocadas junto con las activas:** descartado — dificulta leer el
  estado operativo; el historial bajo demanda mantiene la lista principal limpia.
- **Exponer o revocar keys system desde `/keys`:** descartado — son responsabilidad
  del pipeline one-shot y no de la administración humana.

## Archivos

- Creados: `backend/src/api/keys.ts`, `backend/src/api/keys.test.ts`,
  `frontend/src/pages/Keys.tsx`,
  `docs/features/2026-08-21-keys-dashboard.md`.
- Modificados: `packages/db/src/repos.ts`, `packages/db/src/index.ts`,
  `packages/db/src/db.test.ts`, `backend/src/server.ts`,
  `backend/src/server.test.ts`, `frontend/src/App.tsx`,
  `frontend/src/components/Layout.tsx`, `frontend/src/lib/types.ts`,
  `frontend/src/pages/Overview.tsx`, `frontend/src/pages/Settings.tsx`,
  `docs/superpowers/specs/2026-08-20-keys-dashboard-design.md`,
  `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`,
  `package.json`.

## Verificación

- `podman exec cardinal-backend bun test --timeout 30000 packages/*/src backend/src`
  → 283 pass / 0 fail, 840 `expect()` calls en 15 archivos.
- `podman exec cardinal-frontend bun run build` → build de producción Vite 8.1.5
  exitoso (34 módulos; `dist/` generado).
