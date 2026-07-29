# Fix: PR #5 pre-merge review findings (v0.1.1)

## Contexto

Revisión pre-merge del PR [#5](https://github.com/snattydev/cardinal-system/pull/5) (`dev` → `main`) bloqueó el merge por 4 críticos y 6 importantes. Detalle de la revisión: [`2026-07-29-pr-5-pre-merge-review.md`](./2026-07-29-pr-5-pre-merge-review.md).

## Qué se hizo

### Críticos

1. **Tests de versión** — dejan de hardcodear `0.1.0`; assert contra `package.json` raíz.
2. **`deploy/Containerfile`** — copia workspace completo (`package.json`, `bun.lock`, `packages/`, manifests de backend/frontend) e instala desde `/app`.
3. **`deploy/Containerfile.frontend`** — mismo patrón de install monorepo; build con `bun run --cwd frontend build`.
4. **`compose.yaml`** — monta `packages/`, `bun.lock` y `frontend/package.json`; `bun install` corre desde la raíz del workspace.

### Importantes

5. **Typecheck** — se eliminaron `references` de `backend/tsconfig.json` (incompatibles con `noEmit` / sin `composite`). Los `paths` ya resuelven los packages.
6. **`useSystem`** — estado y `setInterval` viven en el efecto del hook, con cleanup al unmount.
7. **`db_path`** — removido de `/api/system`, `SystemInfo` y Settings (leak-audit).
8. **`serveStatic`** — verifica que el path resuelto quede dentro de `staticDir` con `resolve()`.
9. **Counts de sistema** — `getSystemCounts()` en `@cardinal/db` + tests.
10. **Mock version** — `MOCK_INFO.version` → `0.1.1`.

### Extra

- Scripts root `build` / `dev:frontend`: `bun run --cwd frontend …` (la forma `bun --cwd … run` no ejecuta el script).

## Por qué

Sin estos cambios el checklist de pre-merge falla (`bun test`, imágenes Podman, compose en clone limpio) y hay leaks / deuda de seguridad en serving estático y API de sistema.

## Decisiones

- Contenedores instalan desde la raíz del monorepo (no desde `backend/` o `frontend/` aislados).
- Frontend no depende de `@cardinal/*`, pero su `package.json` debe existir para que Bun resuelva workspaces.
- No se habilitó `composite` en packages: con Bun + `noEmit` alcanza con `paths`.
- Path traversal fuera de `staticDir` cae al SPA fallback (`index.html`), nunca sirve archivos externos.

## Alternativas consideradas

- Stub vacío de `packages/` en compose → rechazado; hace falta el source real.
- `composite: true` + emit en todos los packages → más complejo, poco valor con Bun.
- 403 en path traversal → se mantiene SPA fallback (compatible con tests existentes y seguro).

## Verificación

- `bun test` → **85/85** pass
- `bun run typecheck` → OK
- `bun run build` → OK
- `podman build -f deploy/Containerfile` → OK
- `podman build -f deploy/Containerfile.frontend` → OK

## Archivos

| Archivo | Cambio |
|---------|--------|
| `backend/src/server.test.ts` | version desde rootPkg |
| `backend/src/api/api.test.ts` | sin assert hardcodeado |
| `backend/src/api/system.ts` | sin `db_path`; usa `getSystemCounts` |
| `backend/src/static.ts` | path containment con `resolve` |
| `backend/tsconfig.json` | sin `references` |
| `compose.yaml` | mounts workspace |
| `deploy/Containerfile` | install monorepo |
| `deploy/Containerfile.frontend` | install monorepo |
| `frontend/src/lib/system.ts` | sin leak de interval |
| `frontend/src/lib/types.ts` | sin `db_path` |
| `frontend/src/pages/Settings.tsx` | sin row `db_path` |
| `package.json` | scripts `--cwd` correctos |
| `packages/db/src/repos.ts` | `getSystemCounts` |
| `packages/db/src/index.ts` | export |
| `packages/db/src/db.test.ts` | tests de counts |
