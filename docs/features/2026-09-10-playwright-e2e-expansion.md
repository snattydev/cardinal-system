# Playwright E2E Expansion — Tasks & Overview

## Qué se hizo

Se ejecutó y verificó la suite de tests E2E con Playwright contra el stack local (backend Bun `:8787` + Vite `:5173`), y se amplió la cobertura más allá de autenticación:

- **Auth & redirects** (`frontend/e2e/auth-and-dashboard.e2e.ts`): login SAO, credenciales inválidas, rutas protegidas → `/login`.
- **Tasks** (`frontend/e2e/tasks-and-overview.e2e.ts`): login admin, creación de task con goal único, verificación de badge `open` y `by admin`.
- **Overview** (`frontend/e2e/tasks-and-overview.e2e.ts`): cards de métricas (`Agents Online`, `Keys Active`, `DB Size`, `Uptime`) con datos hidratados desde `/api/system`.

Helper compartido: `frontend/e2e/helpers/auth.ts` (`loginAsAdmin`, credenciales vía `E2E_ADMIN_*` o defaults `admin` / `cardinal-dev`).

## Por qué

El backlog N7 (Automated UI Testing) requería specs Playwright ejecutables en Cloud Agent y cobertura de flujos post-login críticos (tasks + overview), no solo la pantalla de login.

## Decisiones

| Decisión | Alternativa descartada | Motivo |
|----------|------------------------|--------|
| `baseURL` default `http://127.0.0.1:5173` | Mantener `:8080` | Dev local usa Vite en 5173; 8080 es Caddy/pod prod. Override con `PLAYWRIGHT_BASE_URL` para prod. |
| Helper `loginAsAdmin` en `e2e/helpers/` | Duplicar login en cada spec | DRY; credenciales configurables por env en CI. |
| Asserts scoped al task card | `getByText(/by admin/)` global | Evita strict-mode violations cuando hay tasks previas en DB. |
| Sin `webServer` en Playwright config | Auto-start backend+frontend | El entorno Cloud Agent ya levanta servicios vía `.cursor/start.sh`; menos acoplamiento. |

## Archivos creados/modificados

| Archivo | Cambio |
|---------|--------|
| `frontend/e2e/helpers/auth.ts` | **Nuevo** — helper de login E2E |
| `frontend/e2e/tasks-and-overview.e2e.ts` | **Nuevo** — specs Tasks + Overview |
| `frontend/playwright.config.ts` | Default `baseURL` → `:5173` para dev local |

## Cómo ejecutar

```bash
# Terminal 1: backend (requiere .env con POOL_SECRET)
bun run dev:backend

# Terminal 2: frontend
VITE_HOST=0.0.0.0 bun run dev:frontend

# E2E (5 tests)
bun run test:e2e

# Regresiones unitarias
bun test
bun run build
```

Credenciales dev: `admin` / `cardinal-dev` (generadas por `.cursor/start.sh`).

## Evidencia de verificación

- `bun run test:e2e`: **5 passed** (3 auth + 2 tasks/overview), 3 ejecuciones consecutivas estables.
- `bun test`: **461 pass**, 0 fail.
- `bun run build`: OK.
