# Revisión Pre-Merge — PR #5: Pre-Fase 1: Bun Workspaces + Docs Restructure (v0.1.1)

## Contexto

- **PR:** [#5](https://github.com/snattydev/cardinal-system/pull/5)
- **Origen → destino:** `dev` → `main`
- **Estado del PR:** Abierto, a la espera de revisión.
- **Objetivo de la revisión:** Verificar que el código acumulado en `dev` cumpla el checklist de pre-merge y sea estable antes de integrar a `main`.

## Qué se revisó

Se analizó el diff completo entre `main` (626d5fd) y `dev` (18b1a7b) con enfoque en:

1. Alineación con `docs/roadmap.md`, `docs/stack.md` y `AGENTS.md`.
2. Calidad de código y separación de responsabilidades.
3. Seguridad de `auth/`, `keys/` y `ws/`.
4. Tests: `bun test` y `bun run build`.
5. Producción: `Containerfile`, `Containerfile.frontend` y `compose.yaml`.
6. Typecheck: `bun run typecheck`.

## Hallazgos

### 🔴 Críticos (bloquean merge)

1. **Tests fallan por versiones hardcodeadas**
   - Archivos: `backend/src/server.test.ts:75`, `backend/src/api/api.test.ts:14`
   - `package.json` raíz está en `0.1.1`, pero los tests esperan `0.1.0`.
   - Impacto: `bun test` del pre-merge checklist falla.

2. **Backend `Containerfile` no soporta workspaces**
   - Archivo: `deploy/Containerfile:16-23`
   - Solo copia `package.json` raíz y `backend/package.json`, sin `packages/` ni `bun.lock` raíz.
   - Impacto: `bun install` falla con `Workspace dependency "@cardinal/auth" not found`. Imposible deployar backend.

3. **Frontend `Containerfile` no soporta workspaces**
   - Archivo: `deploy/Containerfile.frontend:11-16`
   - Copia `package.json` raíz con workspaces junto a `frontend/package.json`, lo que rompe la resolución de `vite`.
   - Impacto: `bun run build` falla con `vite: command not found`. Imposible deployar frontend.

4. **`compose.yaml` no monta `packages/`**
   - Archivo: `compose.yaml:22-28`
   - Falta montar el directorio `packages/` en el servicio backend.
   - Impacto: `podman-compose up` falla en clone limpio.

### 🟡 Importantes (deberían corregirse antes de merge)

5. **`bun run typecheck` falla**
   - Archivo: `backend/tsconfig.json:23-29`
   - Usa `references` a proyectos que no tienen `"composite": true` y tienen `"noEmit": true`.
   - Impacto: El checklist de pre-merge requiere build limpia; typecheck roto es un riesgo de regresión.

6. **`useSystem` tiene fuga de `setInterval` global**
   - Archivo: `frontend/src/lib/system.ts:22-40`
   - Estado y timer a nivel de módulo; nunca se limpia el intervalo.
   - Impacto: Memory leak y patrón anti-React. Afectará al dashboard a medida que crezca.

7. **`/api/system` expone `db_path`**
   - Archivos: `backend/src/api/system.ts:16`, `frontend/src/pages/Settings.tsx:14`
   - Devuelve la ruta absoluta del archivo SQLite.
   - Impacto: Violación explícita de `docs/security.md` y `AGENTS.md` sobre no filtrar paths.

8. **Protección contra path traversal en `static.ts` es frágil**
   - Archivo: `backend/src/static.ts:6-9`
   - Depende de regex sobre path normalizado en lugar de verificar que el target resuelto esté dentro de `staticDir`.
   - Impacto: Riesgo de seguridad en serving estático.

9. **`handleSystem` usa SQL crudo con casts inseguros**
   - Archivo: `backend/src/api/system.ts:10-11`
   - `db.query(sql).get() as { count: number }` es un cast ciego y duplica lógica que debería vivir en `@cardinal/db`.
   - Impacto: Cambios de schema rompen silenciosamente los counts.

10. **Mock de versión en frontend desactualizado**
    - Archivo: `frontend/src/lib/system.ts:12`
    - `MOCK_INFO.version` es `"0.0.1"`, inconsistente con el resto de la app.
    - Impacto: Inconsistencia menor pero sintomática de mocks sin mantener.

### 🟢 Menores

11. `useAuth.tsx` tiene ramas de error redundantes.
12. Cookie de sesión carece de flag `Secure` para producción HTTPS.
13. No hay rate limiting en login (ya trackeado para Fase 2).
14. Migraciones no tienen `down` (aceptable para Fase 0/1, documentar).

## Recomendaciones de proceso

- Agregar un script de CI/check que ejecute `bun test`, `bun run build`, `bun run typecheck` y smoke de builds de contenedores dentro de la imagen de Bun.
- No hardcodear versiones en tests: assert contra `package.json` o verificar solo forma.
- Los contenedores deben copiar el workspace completo (root `package.json`, `bun.lock`, `packages/`, app objetivo) e instalar desde `/app`.
- Refactorizar `useSystem` para eliminar estado global a nivel de módulo antes de que más componentes lo consuman.
- Eliminar `db_path` de `/api/system` para alinearse con las reglas de leak-audit del proyecto.

## Veredicto

**REQUEST CHANGES** — No está listo para merge.

El refactor a workspaces es sólido y la cobertura de tests es buena, pero hay cuatro bloqueos críticos (tests rotos, dos Containerfiles rotos, compose.yaml roto) y varios problemas importantes de seguridad/TypeScript/React que deben corregirse antes de integrar a `main`.

## Archivos referenciados

- `backend/src/server.test.ts`
- `backend/src/api/api.test.ts`
- `backend/src/api/system.ts`
- `backend/src/static.ts`
- `backend/tsconfig.json`
- `frontend/src/lib/system.ts`
- `frontend/src/pages/Settings.tsx`
- `frontend/src/hooks/useAuth.tsx`
- `deploy/Containerfile`
- `deploy/Containerfile.frontend`
- `compose.yaml`
- `package.json`
- `packages/core/tsconfig.json`
- `packages/auth/src/session.ts`
- `packages/auth/src/routes.ts`
- `packages/db/src/schema.ts`

---

*Revisión generada el 2026-07-29.*
