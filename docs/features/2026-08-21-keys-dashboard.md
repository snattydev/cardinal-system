# Keys Dashboard (2026-08-21)

Dashboard for listing and revoking persistent agent keys.

## What was done

Enabled the protected `/keys` page to list active human-created keys and revoke
them individually. The JWT API exposes `GET /api/keys`, its history variant
`?status=revoked`, and `POST /api/keys/:id/revoke`; responses use camelCase and
omit hashes and plaintext.

The page includes inline confirmation for revoke and keeps revoked keys behind
a minimal log-icon control. It also enables the Keys link in the sidebar, links
the Keys Active card on Overview, and replaces the Settings placeholder. The
`keysActive` and `keysRevoked` counters now consider only persistent keys
(`created_by=human`).

## Why

The CLI already supported managing `agent_keys`, but the dashboard displayed Keys
as a future capability. This slice closes that gap without exposing secrets or
mixing human-managed persistent keys with system one-shot keys.

## Decisions

- Key creation remains in CLI: plaintext is printed once and no UI or creation
  endpoint was added.
- Revocation operates on an individual `id`, not on agent name, avoiding
  invalidating sibling keys.
- History lives behind a log icon rather than a second permanently visible table,
  separating active keys from revoked ones.
- `system` key IDs return 404 on revoke: the dashboard API never mutates or lists
  them.
- `keysActive` and `keysRevoked` count only `human` keys, ensuring Overview and
  Settings reflect the same population as `/keys`.
- The live one-shot block and hard-delete are excluded from this slice; they
  belong to the future one-shot pipeline.

## Alternatives Considered

- **Create keys from dashboard:** rejected — would increase the surface that can
  display plaintext and contradicts the CLI's single-print flow.
- **Revoke by agent name:** rejected — would revoke all its active keys when the
  dashboard action must be granular.
- **Show revoked keys alongside active keys:** rejected — obscures operational
  state; on-demand history keeps the primary list clean.
- **Expose or revoke system keys from `/keys`:** rejected — they belong to the
  one-shot pipeline rather than human management.

## Files

- Created: `backend/src/api/keys.ts`, `backend/src/api/keys.test.ts`,
  `frontend/src/pages/Keys.tsx`,
  `docs/features/2026-08-21-keys-dashboard.md`.
- Modified: `packages/db/src/repos.ts`, `packages/db/src/index.ts`,
  `packages/db/src/db.test.ts`, `backend/src/server.ts`,
  `backend/src/server.test.ts`, `frontend/src/App.tsx`,
  `frontend/src/components/Layout.tsx`, `frontend/src/lib/types.ts`,
  `frontend/src/pages/Overview.tsx`, `frontend/src/pages/Settings.tsx`,
  `docs/superpowers/specs/2026-08-20-keys-dashboard-design.md`,
  `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`,
  `package.json`.

## Verification

- `podman exec cardinal-backend bun test --timeout 30000 packages/*/src backend/src`
  -> 283 pass / 0 fail, 840 `expect()` calls across 15 files.
- `podman exec cardinal-frontend bun run build` -> Vite 8.1.5 production build
  succeeded (34 modules; `dist/` generated).
