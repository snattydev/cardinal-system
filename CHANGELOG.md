# Changelog

All notable changes to Cardinal System are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows `MAJOR.FASE.PATCH` versioning, where `FASE` is the current
roadmap phase. The source of truth is the `version` field in root
[`package.json`](package.json). Intermediate PATCH versions (`0.1.1`,
`0.2.1`, `0.2.2`, `0.2.3`, and `0.2.5`) are consolidated under their closing
milestone sections (`0.2.0` and `0.2.6`).

## [Unreleased]

## [0.2.8] - 2026-11-28

MCP deployment and review workflow groundwork for the next `dev` release.

### Added

- `deploy/Containerfile.mcp` and Quadlet `cardinal-mcp.container`: the
  Streamable HTTP MCP Context Hub now runs inside the production pod on
  `127.0.0.1:8789` with read-only vault and config bind mounts, a writable
  `agent-state` mount, and `UserNS=keep-id:uid=1000,gid=1000` (#70).
- `deploy/README.md` MCP deployment guide: architecture diagram, MCP image
  build, bind mounts, SELinux `:Z` caveat, `git` auto-commit degradation, and
  an optional `systemd --user` timer for `scripts/sync-configs.sh` (#70).
- Three-tier PR review workflow templates in `.github/REVIEW_TEMPLATES/`
  (quick, bug-finder, deep) with matching prompts, the `bug-finder` role, and
  the synced `cardinal-pr` skill (PR #73 / #69).

### Changed

- Realigned READMEs, roadmap, stack, operational guides, and AGENTS docs with
  the public `v0.2.7` release (PR #68).

## [0.2.7] - 2026-11-27

Context Hub v2 Stage 1, OSS security hardening, and public release (`3dca0c2`).
The PATCH bump from `0.2.6` covers post-freeze N1 worker work alongside Context
Hub v2 Stage 1 and security hardening.

### Added

- Path-glob ACLs (`vault:read:<glob>`, `vault:write:<glob>`,
  `vault:allow-personal`) denying `personal/**` to all keys unless the key
  carries both `vault:allow-personal` and a matching `vault:read:` scope (writes
  to `personal/**` are always denied; `*` never grants write access).
- Physical read/write separation: source vaults mounted `:ro` at `/data/vaults`,
  and agent writes confined to an isolated `:rw` `agent-state` root with slug
  validation, symlink checks, and atomic writes.
- Built-in SQLite FTS5 search (`porter unicode61`, BM25 ranking, sanitized
  queries, post-query ACL filtering) with an optional QMD sidecar
  (`--profile qmd`) and automatic FTS5 fallback.
- Deterministic zero-LLM onboarding through the `cardinal_onboard` prompt and
  tool (`coding` and `hermes` modes).
- `cardinal_bootstrap_repo` prompt and tool ("Configuration 101") with tiered
  repo standards, hooks, and portable workflow skills.
- Sanitized host config snapshots (`cardinal_agent_config` and strictly opt-in
  `cardinal_user_config`) read from redacted `:ro` snapshots.
- `mcp_usage` telemetry table, `POST /api/internal/mcp/usage`, and
  `GET /api/system` counters (`mcp_calls_7d`, `mcp_calls_30d`,
  `mcp_last_call_at`) for the 30-day usage gate (#62).
- `board:*` and `mailbox:*` scope enforcement on `/api/tasks*` and
  `/api/messages*`.
- Internal N1 maintenance worker (`packages/worker`, PR #36; frozen under
  Context Hub v2 #62) and expanded regression test coverage (PR #39, PR #51).
- Public open-source governance: MIT `LICENSE`, `SECURITY.md`,
  `.github/workflows/ci.yml`, and versioned `.githooks/` (`commit-msg`,
  `pre-commit`) activated via `bun run hooks:install`.

### Changed

- Reworked `packages/mcp` on `:8789` into the Context Hub v2 Streamable HTTP
  MCP server (`@modelcontextprotocol/sdk` per-request stateless mode,
  `POST /mcp`, `GET /health`), replacing the earlier Phase 2 JSON-RPC handler.
- Released the repository publicly under the MIT license and froze commodity
  layers (LLM router expansion, N1 worker loops) under the usage-gated Context
  Hub v2 plan (#62).

### Fixed

- Charged USD budgets across Fusion router hops (PR #35).
- Hardened MCP write ACL checks, config redaction ordering, FTS5 query
  sanitization, and UTF-8 hook output.

### Security

- Login IP failure rate limiting (`429` with `Retry-After`) before Argon2id
  verification.
- WebSocket `Origin` host check (`403 forbidden_origin`), 10s unauthenticated
  handshake deadline (`4401 auth_timeout`), and connection caps
  (`4429 too_many_connections`).
- `/api/internal/*` isolation through an optional `INTERNAL_SERVICE_SECRET`
  with timing-safe comparison, plus an nginx `403` block.
- Non-root backend container (`USER bun`) with `/data` owned by `bun:bun`.
- `GET /v1/models` now requires a dashboard JWT or an active `sk-cardinal-*`
  Bearer key.
- Helper proxies bind to `127.0.0.1` by default and fail closed on
  unauthenticated non-loopback runs.

## [0.2.6] - 2026-09-18

Phase 2 freeze (`7ef099e`): Blackboard, MCP hub, and key pool/router.
Consolidates intermediate `0.2.1`, `0.2.2`, `0.2.3`, and `0.2.5` changes on
`main`.

### Added

- Blackboard tasks CRUD with claim/complete, `/tasks` dashboard page, and
  WebSocket broadcast of board changes.
- Mailbox agent-to-agent handoffs (`GET/POST /api/messages` and MCP mailbox
  tools), using the key as identity.
- Provider-agnostic LLM router with transparent failover,
  `POST /v1/chat/completions`, `GET /v1/models`, and Fusion / MoA via
  `model=fusion`.
- Keys dashboard at `/keys` with scopes, token budget, expiry, and USD cap,
  enforced by the router (`401` on expiry, `402` on budget).
- SAO design system overhaul: tokens, primitive components, and migrated
  Overview, AgentCard, and Tasks pages.
- Playwright E2E baseline for authentication, overview, and tasks, with
  expanded coverage.
- Initial MCP server on `:8789` with board and mailbox tools.

## 0.2.0 - 2026-08-06

Phase 1 Context Store complete (`9e8fed9`). Consolidates the `0.1.1` Bun
workspaces and docs restructure (`64e5e2f`).

### Added

- Profiles, souls, skills, memory mirror, session index, and config templates.
- Device registry with WebSocket broadcast.
- Vault RAG proxy with a TTL cache.

## 0.1.0 - 2026-07-24

Phase 0 living skeleton complete (`dc15e26`).

### Added

- Human login with JWT in an `httpOnly` cookie.
- SAO dashboard with sidebar navigation.
- Agent Hub WebSocket with a real-time roster.
- SQLite tables for agents, agent keys, and agent events.
- `sk-cardinal-*` API keys with a CLI keygen.
- Agent and subagent classification.
- Podman Quadlet deployment with Caddy.
- Reference WebSocket client in `examples/ws-agent.ts`.

## 0.0.1 - 2026-07-23

### Added

- Initial monorepo scaffold for root, backend, and frontend (`1c9d58c`).

[Unreleased]: https://github.com/snattydev/cardinal-system/compare/v0.2.8...main
[0.2.8]: https://github.com/snattydev/cardinal-system/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/snattydev/cardinal-system/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/snattydev/cardinal-system/compare/9e8fed9...v0.2.6
