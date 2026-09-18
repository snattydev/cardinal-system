# Bun Workspaces Refactor — Fase 0 -> Fase 1 Migration

**Date:** 2026-07-29
**Phase:** Preparation for Fase 1 (Context Store)

## What

The monolithic backend (`backend/src/`) was decomposed into 5 Bun workspace packages under `packages/`, each with clear responsibilities and boundaries. `backend/src/` was reduced to a composition layer (server, handlers, static serve).

## Why

The Fase 0 backend was a single directory with everything mixed together: auth, keys, db, protocol, handlers. For Fase 1 (Context Store), requirements included:
- Packages must be testable in isolation (TDD in packages, integration tests in backend)
- Dependencies must be explicit and acyclic
- The CLI (`keygen`) must live alongside the package exposing the logic, not in the backend

## Architecture — Dependency Graph

```
@cardinal/core          (shared types, config, http, protocol)
    |
    v
@cardinal/db            (schema, migrations, repos)
    |
    v
@cardinal/auth  @cardinal/keys   (JWT/session, key gen/hash)
    |               |
    v               v
@cardinal/ws            (hub, agent lifecycle, messages)
    |
    v
backend/                (composition: server, api handlers, static)
```

**Rule:** dependencies flow from top to bottom. No package imports from another that precedes it in the graph.

## Decisions

### 5 packages (not 1, not 10)

- **Not 1:** a single mega-package does not solve isolated testing or explicit boundary problems
- **Not 10:** excessive granularity for the current phase (e.g. separating migrations from repos, or protocol from types)
- **5 packages** aligned with the system's security model: core -> db -> auth/keys -> ws

Each package maps to a mandatory TDD column defined in AGENTS.md.

### json() in @cardinal/core

The `json()` helper (response wrapper with content-type) was in `backend/src/http.ts`. It was moved to `@cardinal/core/src/http.ts` so any package can use it without coupling to the backend.

A shim was left in `backend/src/http.ts` that re-exports from `@cardinal/core` for a smooth transition during migration.

### Paths config in backend/tsconfig.json

The backend tsconfig uses `paths` to resolve `@cardinal/*` to `packages/*/src`. This allows Bun to resolve packages in development without an intermediate build step (Bun supports native TypeScript).

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
package.json                    <- "workspaces": ["packages/*", "backend", "frontend"]
backend/package.json            <- @cardinal/* dependencies instead of inline logic
backend/tsconfig.json           <- paths + references to resolve @cardinal/*
backend/src/index.ts            <- use @cardinal/* instead of local imports
backend/src/server.ts           <- ditto
backend/src/api/system.ts       <- import json() from @cardinal/core
backend/src/api/health.ts       <- ditto
backend/src/api/agents.ts       <- ditto
backend/src/http.ts             <- shim: re-export from @cardinal/core
backend/src/websocket.ts        <- use @cardinal/ws, @cardinal/db, @cardinal/keys
```

## Alternatives Considered

- **NX / Turborepo:** unnecessary overhead for 5 packages. Native Bun workspaces is sufficient.
- **Publishing to npm registry:** unnecessary for internal development. tsconfig paths resolve at development time.
- **Monorepo with `bun build --target bun`:** compiling packages to `.js` was evaluated, but Bun natively supports `.ts`, making it unnecessary. Will be reconsidered in production if cold-start issues arise.
