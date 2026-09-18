# Pre-Merge Review — PR #5: Pre-Fase 1: Bun Workspaces + Docs Restructure (v0.1.1)

## Context

- **PR:** [#5](https://github.com/snattydev/cardinal-system/pull/5)
- **Source -> target:** `dev` -> `main`
- **PR Status:** Open, awaiting review.
- **Review Objective:** Verify that cumulative code on `dev` satisfies the pre-merge checklist and is stable before integrating into `main`.

## What was reviewed

Analyzed the complete diff between `main` (626d5fd) and `dev` (18b1a7b) focusing on:

1. Alignment with `docs/roadmap.md`, `docs/stack.md`, and `AGENTS.md`.
2. Code quality and separation of concerns.
3. Security of `auth/`, `keys/`, and `ws/`.
4. Tests: `bun test` and `bun run build`.
5. Production: `Containerfile`, `Containerfile.frontend`, and `compose.yaml`.
6. Typecheck: `bun run typecheck`.

## Findings

### [critical] Critical (block merge)

1. **Tests fail due to hardcoded versions**
   - Files: `backend/src/server.test.ts:75`, `backend/src/api/api.test.ts:14`
   - Root `package.json` is at `0.1.1`, but tests expect `0.1.0`.
   - Impact: `bun test` in pre-merge checklist fails.

2. **Backend `Containerfile` does not support workspaces**
   - File: `deploy/Containerfile:16-23`
   - Only copies root `package.json` and `backend/package.json`, without `packages/` or root `bun.lock`.
   - Impact: `bun install` fails with `Workspace dependency "@cardinal/auth" not found`. Backend cannot be deployed.

3. **Frontend `Containerfile` does not support workspaces**
   - File: `deploy/Containerfile.frontend:11-16`
   - Copies root `package.json` with workspaces alongside `frontend/package.json`, breaking `vite` resolution.
   - Impact: `bun run build` fails with `vite: command not found`. Frontend cannot be deployed.

4. **`compose.yaml` does not mount `packages/`**
   - File: `compose.yaml:22-28`
   - Missing mount for `packages/` directory into backend service.
   - Impact: `podman-compose up` fails in clean clone.

### [warning] Important (should be fixed before merge)

5. **`bun run typecheck` fails**
   - File: `backend/tsconfig.json:23-29`
   - Uses `references` to projects without `"composite": true` and with `"noEmit": true`.
   - Impact: Pre-merge checklist requires clean build; broken typecheck is a regression risk.

6. **`useSystem` has global `setInterval` leak**
   - File: `frontend/src/lib/system.ts:22-40`
   - Module-level state and timer; interval is never cleared.
   - Impact: Memory leak and anti-React pattern. Affects dashboard as it grows.

7. **`/api/system` exposes `db_path`**
   - Files: `backend/src/api/system.ts:16`, `frontend/src/pages/Settings.tsx:14`
   - Returns absolute path of SQLite file.
   - Impact: Explicit violation of `docs/security.md` and `AGENTS.md` regarding path leaking.

8. **Path traversal protection in `static.ts` is fragile**
   - File: `backend/src/static.ts:6-9`
   - Relies on regex on normalized path instead of verifying that resolved target is inside `staticDir`.
   - Impact: Security risk in static serving.

9. **`handleSystem` uses raw SQL with unsafe casts**
   - File: `backend/src/api/system.ts:10-11`
   - `db.query(sql).get() as { count: number }` is a blind cast duplicating logic that belongs in `@cardinal/db`.
   - Impact: Schema changes silently break counts.

10. **Outdated version mock in frontend**
    - File: `frontend/src/lib/system.ts:12`
    - `MOCK_INFO.version` is `"0.0.1"`, inconsistent with the rest of the application.
    - Impact: Minor inconsistency, but symptomatic of unmaintained mocks.

### [minor] Minor

11. `useAuth.tsx` has redundant error branches.
12. Session cookie lacks `Secure` flag for production HTTPS.
13. No rate limiting on login (already tracked for Fase 2).
14. Migrations have no `down` (acceptable for Fase 0/1, document).

## Process Recommendations

- Add a CI/check script executing `bun test`, `bun run build`, `bun run typecheck`, and container build smoke checks inside the Bun image.
- Do not hardcode versions in tests: assert against `package.json` or verify shape only.
- Containers must copy the entire workspace (root `package.json`, `bun.lock`, `packages/`, target app) and install from `/app`.
- Refactor `useSystem` to eliminate module-level global state before more components consume it.
- Remove `db_path` from `/api/system` to align with the project's leak-audit rules.

## Verdict

**REQUEST CHANGES** — Not ready for merge.

The workspace refactor is solid and test coverage is good, but there are four critical blockers (broken tests, two broken Containerfiles, broken compose.yaml) and several important security/TypeScript/React issues that must be addressed before integrating into `main`.

## Referenced Files

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

*Review generated on 2026-07-29.*
