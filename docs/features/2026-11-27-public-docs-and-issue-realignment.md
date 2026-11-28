# Public Release Docs & Issue Realignment

- **Date:** 2026-11-27
- **Branch:** `docs/#31-public-realignment`
- **Issues:** Closes #31, Closes #46, Closes #49 (and aligns status across #62, #42, #43, #45, #47, #18)

## What Changed

Realigned READMEs, operational guides, AGENTS docs, and roadmap/stack documentation with the public `v0.2.7` release on `main` (Context Hub v2 Stage 1 + OSS security hardening) and resolved stale Phase 2 / pre-public drift.

### READMEs & Operational Docs
- **`README.md`:** Updated version and phase table (`v0.2.7`, Context Hub v2 Stage 1 shipped, 30-day usage gate active in `#62`), expanded "What is in today" (login rate limit, WS checks/caps, `cardinal_bootstrap_repo`, `cardinal_agent_config`/`cardinal_user_config`, frozen router + `/v1/models` auth), added public clone URL and `INTERNAL_SERVICE_SECRET` in secret setup, synced Root scripts with `package.json`, added Context Hub v2 / OSS hardening / `SECURITY.md` links, and removed stale `unmerged N1` wording.
- **`deploy/README.md`:** Switched health verify example from `localhost:8080` to `127.0.0.1:8080`, noted non-root `USER bun` backend and `/api/internal/` nginx block, documented `compose.yaml` coverage for `cardinal-mcp`/`cardinal-qmd` and `Caddyfile` domain example, replaced stale "backlog item 11" / CLI password example with `bun run bootstrap:password --cloud` / stdin pipe, and added `POOL_SECRET` + `INTERNAL_SERVICE_SECRET` to the env table.
- **`compose.yaml`:** Updated setup comment to include `POOL_SECRET`.

### Architecture, Roadmap, & Guides
- **`docs/stack.md`:** Rewritten for `v0.2.7` (Bun workspaces, `packages/mcp`, SQLite FTS5 + optional QMD, Quadlet/nginx/non-root backend, Playwright E2E, GitHub Actions CI, `.githooks/`).
- **`docs/roadmap.md` & `docs/roadmap/fase-2.md`:** Marked Phase 2 (`v0.2.6`) and Context Hub v2 Stage 1 (`v0.2.7`) shipped on `main`; updated Stage 2 extraction note to reflect that the monorepo is already public.
- **`docs/vision.md`:** Added `cardinal_bootstrap_repo` and sanitized config snapshot tools; updated date.
- **`docs/guides/pitfalls.md`:** Fixed keygen CLI path (`packages/keys/src/cli.ts`) and marked the host RAG proxy section legacy with `127.0.0.1` fail-closed default.
- **`docs/guides/router-usage.md`:** Added frozen-router notice, updated `/v1/models` auth and `0.2.7` health version, replaced Spanish `"Hola"` prompt strings with `"Hello"`, and scrubbed personal host paths (`~/Data`).
- **`context/ecosystem.md`:** Updated status block from `v0.2.5` closing to `v0.2.7` shipped.
- **`docs/features/2026-11-27-oss-security-hardening.md` & legacy plans:** Marked OSS hardening merged in `v0.2.7` and scrubbed `~/Data` personal path references in historical plan docs.

### AGENTS & Repo Standards Docs
- **`AGENTS.md`:** Added `SECURITY.md` and `.github/workflows/ci.yml` references and updated the current state table to `2026-11-27`.
- **`AGENTS/issues.md` & `AGENTS/prs.md`:** Documented GitHub's `Closes #N` behavior (auto-closes only on merge to default branch `main`, not `dev`).
- **`AGENTS/structure.md`:** Added `packages/rag/`, `packages/worker/`, updated `packages/mcp/`, full `deploy/` and `.github/` layouts, `LICENSE`, `SECURITY.md`, and `compose.yaml`.
- **`AGENTS/tdd.md`:** Updated `typecheck` scope (`backend`, `packages/mcp`, `frontend`) and noted GitHub Actions CI.

## Why

The repository went public (`v0.2.7` on `main`), but READMEs and reference docs still carried pre-public / Phase 2 draft state (`v0.2.5`/`v0.2.6`, active feature branch references, `unmerged N1`, `localhost:8080`, stale keygen/bootstrap notes, and personal directory paths).

## Decisions

- **Do not touch code or runtime behavior:** This PR is strictly docs/comment alignment plus issue hygiene.
- **Keep `Closes #31`, `Closes #46`, `Closes #49` in PR body and leave remaining issues open with accurate status comments:** `#62` (30-day usage gate), `#42` (workspace typecheck/lint), `#43` (WS rate limit), `#45` (HTTP security headers / digest pins), `#47` (CHANGELOG + tags), `#18` (N7 E2E decision), and `#58` (host `dev:backend` SQLite bug) stay open until resolved or triaged by the owner.

## Files Created / Modified

- Created: `docs/features/2026-11-27-public-docs-and-issue-realignment.md`
- Modified: `README.md`, `deploy/README.md`, `AGENTS.md`, `AGENTS/issues.md`, `AGENTS/prs.md`, `AGENTS/structure.md`, `AGENTS/tdd.md`, `docs/roadmap.md`, `docs/roadmap/fase-2.md`, `docs/stack.md`, `docs/vision.md`, `docs/guides/pitfalls.md`, `docs/guides/router-usage.md`, `context/ecosystem.md`, `compose.yaml`, `docs/features/2026-11-27-oss-security-hardening.md`, `docs/superpowers/plans/2026-08-22-goldrush-engineer-prompt.md`, `docs/superpowers/plans/2026-08-17-cardinal-v2-backlog.md`
