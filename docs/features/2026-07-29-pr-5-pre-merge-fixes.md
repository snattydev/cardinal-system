# Fix: PR #5 pre-merge review findings (v0.1.1)

## Context

Pre-merge review of PR [#5](https://github.com/snattydev/cardinal-system/pull/5) (`dev` -> `main`) blocked the merge due to 4 critical and 6 important findings. Review details: [`2026-07-29-pr-5-pre-merge-review.md`](./2026-07-29-pr-5-pre-merge-review.md).

## What was done

### Critical

1. **Version tests** — stopped hardcoding `0.1.0`; assert against root `package.json`.
2. **`deploy/Containerfile`** — copies full workspace (`package.json`, `bun.lock`, `packages/`, backend/frontend manifests) and installs from `/app`.
3. **`deploy/Containerfile.frontend`** — same monorepo install pattern; builds with `bun run --cwd frontend build`.
4. **`compose.yaml`** — mounts `packages/`, `bun.lock`, and `frontend/package.json`; `bun install` runs from workspace root.

### Important

5. **Typecheck** — removed `references` from `backend/tsconfig.json` (incompatible with `noEmit` / without `composite`). `paths` already resolve packages.
6. **`useSystem`** — state and `setInterval` live in hook effect, with cleanup on unmount.
7. **`db_path`** — removed from `/api/system`, `SystemInfo`, and Settings (leak-audit).
8. **`serveStatic`** — verifies resolved path stays within `staticDir` using `resolve()`.
9. **System counts** — `getSystemCounts()` in `@cardinal/db` + tests.
10. **Mock version** — `MOCK_INFO.version` -> `0.1.1`.

### Extra

- Root scripts `build` / `dev:frontend`: `bun run --cwd frontend ...` (the `bun --cwd ... run` form does not execute the script).

## Why

Without these changes, the pre-merge checklist fails (`bun test`, Podman images, compose in a clean clone) and security leaks / technical debt remain in static serving and the system API.

## Decisions

- Containers install from monorepo root (not from isolated `backend/` or `frontend/`).
- Frontend does not depend on `@cardinal/*`, but its `package.json` must exist for Bun to resolve workspaces.
- Did not enable `composite` in packages: with Bun + `noEmit`, `paths` is sufficient.
- Path traversal outside `staticDir` falls back to the SPA fallback (`index.html`), never serving external files.

## Alternatives Considered

- Empty stub of `packages/` in compose -> rejected; real source is required.
- `composite: true` + emit across all packages -> more complex, little value with Bun.
- 403 on path traversal -> maintained SPA fallback (compatible with existing tests and secure).

## Verification

- `bun test` -> **85/85** pass
- `bun run typecheck` -> OK
- `bun run build` -> OK
- `podman build -f deploy/Containerfile` -> OK
- `podman build -f deploy/Containerfile.frontend` -> OK

## Files

| File | Change |
|------|--------|
| `backend/src/server.test.ts` | version from rootPkg |
| `backend/src/api/api.test.ts` | without hardcoded assert |
| `backend/src/api/system.ts` | without `db_path`; uses `getSystemCounts` |
| `backend/src/static.ts` | path containment with `resolve` |
| `backend/tsconfig.json` | without `references` |
| `compose.yaml` | workspace mounts |
| `deploy/Containerfile` | monorepo install |
| `deploy/Containerfile.frontend` | monorepo install |
| `frontend/src/lib/system.ts` | no interval leak |
| `frontend/src/lib/types.ts` | without `db_path` |
| `frontend/src/pages/Settings.tsx` | without `db_path` row |
| `package.json` | correct `--cwd` scripts |
| `packages/db/src/repos.ts` | `getSystemCounts` |
| `packages/db/src/index.ts` | export |
| `packages/db/src/db.test.ts` | counts tests |
