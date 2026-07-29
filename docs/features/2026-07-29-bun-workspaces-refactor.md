# Bun Workspaces Refactor — Fase 0 → Fase 1 Migration

**Date:** 2026-07-29
**Phase:** Preparación para Fase 1 (Context Store)

## What

El backend monolítico (`backend/src/`) fue descompuesto en 5 paquetes Bun workspace bajo `packages/`, cada uno con responsabilidad y límites claros. `backend/src/` quedó reducido a una capa de composición (server, handlers, static serve).

## Why

El backend de Fase 0 era un solo directorio con todo mezclado: auth, keys, db, protocolo, handlers. Para Fase 1 (Context Store), se necesita que:
- Los paquetes sean testeables de forma aislada (TDD en paquetes, tests de integración en backend)
- Las dependencias sean explícitas y acíclicas
- El CLI (`keygen`) viva junto al paquete que expone la lógica, no en el backend

## Architecture — Dependency Graph

```
@cardinal/core          (tipos compartidos, config, http, protocolo)
    ↓
@cardinal/db            (schema, migraciones, repos)
    ↓
@cardinal/auth  @cardinal/keys   (JWT/session, key gen/hash)
    ↓               ↓
@cardinal/ws            (hub, agent lifecycle, mensajes)
    ↓
backend/                (composición: server, api handlers, static)
```

**Regla:** las dependencias van de arriba hacia abajo. Ningún paquete importa de otro que lo precede en el grafo.

## Decisions

### 5 paquetes (no 1, no 10)

- **No 1:** un solo mega-paquete no resuelve el problema de testing aislado ni límites explícitos
- **No 10:** granularidad excesiva para la fase actual (ej: separar migrations de repos, o protocol de types)
- **5 paquetes** alineados con el modelo de seguridad del sistema: core → db → auth/keys → ws

Cada paquete mapea a una columna de TDD obligatorio definida en AGENTS.md.

### json() en @cardinal/core

El helper `json()` (response wrapper con content-type) estaba en `backend/src/http.ts`. Se movió a `@cardinal/core/src/http.ts` para que cualquier paquete pueda usarlo sin acoplar al backend.

Se dejó un shim en `backend/src/http.ts` que re-exporta desde `@cardinal/core` para transición suave durante la migración.

### Paths config en backend/tsconfig.json

El tsconfig del backend usa `paths` para resolver `@cardinal/*` a `packages/*/src`. Esto permite que Bun resuelva los paquetes en desarrollo sin build intermedio (Bun entiende TypeScript nativo).

## Files Created

```
packages/core/package.json
packages/core/tsconfig.json
packages/core/src/index.ts
packages/core/src/types.ts
packages/core/src/config.ts
packages/core/src/config.test.ts
packages/core/src/http.ts
packages/core/src/protocol.ts
packages/core/src/protocol.test.ts

packages/db/package.json
packages/db/tsconfig.json
packages/db/src/index.ts
packages/db/src/schema.ts
packages/db/src/repos.ts
packages/db/src/db.test.ts

packages/auth/package.json
packages/auth/tsconfig.json
packages/auth/src/index.ts
packages/auth/src/jwt.ts
packages/auth/src/session.ts
packages/auth/src/routes.ts
packages/auth/src/auth.test.ts

packages/keys/package.json
packages/keys/tsconfig.json
packages/keys/src/index.ts
packages/keys/src/cli.ts
packages/keys/src/keys.test.ts

packages/ws/package.json
packages/ws/tsconfig.json
packages/ws/src/index.ts
packages/ws/src/hub.ts
packages/ws/src/hub.test.ts
```

## Files Modified

```
package.json                    ← "workspaces": ["packages/*", "backend", "frontend"]
backend/package.json            ← dependencias @cardinal/* en lugar de lógica inline
backend/tsconfig.json           ← paths + references para resolver @cardinal/*
backend/src/index.ts            ← usar @cardinal/* en lugar de imports locales
backend/src/server.ts           ← ídem
backend/src/api/system.ts       ← import json() from @cardinal/core
backend/src/api/health.ts       ← ídem
backend/src/api/agents.ts       ← ídem
backend/src/http.ts             ← shim: re-export from @cardinal/core
backend/src/websocket.ts        ← usar @cardinal/ws, @cardinal/db, @cardinal/keys
```

## Alternatives Considered

- **NX / Turborepo:** overhead innecesario para 5 paquetes. Bun workspaces nativo es suficiente.
- **Publicar a npm registry:** no necesario para desarrollo interno. Los paths del tsconfig resuelven en tiempo de desarrollo.
- **Monorepo con `bun build --target bun`:** se evaluó compilar los packages a `.js` pero Bun entiende `.ts` nativo, así que no hace falta. Se reconsiderará en producción si hay problemas de cold start.
