# Changelog

All notable changes to Cardinal System are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows `MAJOR.FASE.PATCH` versioning, where `FASE` is the current
roadmap phase. The source of truth is the `version` field in the root
[`package.json`](package.json).

## [Unreleased]

### Added

- Nothing yet.

## [0.2.7] - 2026-11-27

Context Hub v2 Stage 1 and the public open-source release.

### Added

- Streamable HTTP MCP Context Hub in `packages/mcp` on `:8789` (`POST /mcp`, `GET /health`), built on the official MCP SDK in per-request stateless mode.
- Path-glob ACLs (`vault:read:<glob>`, `vault:write:<glob>`, `vault:allow-personal`) with an unconditional `personal/**` hard deny and no write access granted by `*`.
- Physical read/write separation: source vaults mounted `:ro` at `/data/vaults`, writes confined to a `:rw` `agent-state` root with slug validation, symlink checks, and atomic writes.
- Built-in SQLite FTS5 search (porter unicode61, BM25 ranking, sanitized queries, post-query ACL filtering) with an optional QMD sidecar (`--profile qmd`) and automatic FTS5 fallback.
- Deterministic zero-LLM onboarding through the `cardinal_onboard` prompt and tool, with `coding` and `hermes` modes.
- `cardinal_bootstrap_repo` prompt and tool ("Configuration 101") with tiered repo standards, hooks, and portable workflow skills.
- Sanitized host config snapshots: `cardinal_agent_config` and the strictly opt-in `cardinal_user_config`, read from redacted `:ro` snapshots.
- `mcp_usage` telemetry table, `POST /api/internal/mcp/usage`, and `GET /api/system` counters (`mcp_calls_7d`, `mcp_calls_30d`, `mcp_last_call_at`) for the 30-day usage gate.
- `board:*` and `mailbox:*` scope enforcement on `/api/tasks*` and `/api/messages*`.

### Changed

- Repository released publicly under the MIT license.
- Documentation realigned with the public release across READMEs, roadmap, stack, guides, and AGENTS docs (PR #68).

### Security

- Login IP failure rate limiting (`429` with `Retry-After`) before Argon2id verification.
- WebSocket `Origin` host check (`403 forbidden_origin`), 10s unauthenticated handshake deadline (`4401 auth_timeout`), and connection caps (`4429 too_many_connections`).
- `/api/internal/*` isolation through an optional `INTERNAL_SERVICE_SECRET` with timing-safe comparison, plus an nginx `403` block.
- Non-root backend container (`USER bun`) with `/data` owned by `bun:bun`.
- `GET /v1/models` now requires a dashboard JWT or an active `sk-cardinal-*` Bearer key.
- Helper proxies bind to `127.0.0.1` by default and fail closed on unauthenticated non-loopback runs.
- Added MIT `LICENSE`, `SECURITY.md`, and `.github/workflows/ci.yml`.
- Enforced versioned `.githooks/` (`commit-msg`, `pre-commit`) activated with `bun run hooks:install`.

## [0.2.6] - 2026-09-18

Phase 2 freeze: Blackboard, MCP hub, and key pool/router.

### Added

- Blackboard tasks CRUD with claim/complete, a `/tasks` dashboard page, and WebSocket broadcast of board changes.
- Mailbox agent-to-agent handoffs (`GET/POST /api/messages` and MCP mailbox tools), using the key as identity.
- Provider-agnostic LLM router with transparent failover, `POST /v1/chat/completions`, `GET /v1/models`, and Fusion / MoA through `model=fusion`.
- Keys dashboard at `/keys` with scopes, token budget, expiry, and USD cap, enforced by the router (`401` on expiry, `402` on budget).
- SAO design system overhaul: tokens, primitive components, and migrated Overview, AgentCard, and Tasks pages.
- Playwright E2E baseline for authentication, overview, and tasks, with expanded coverage.
- MCP board and mailbox tools, and the MCP server on `:8789`.

## [0.2.0] - 2026-08-06

Phase 1 Context Store complete.

### Added

- Profiles, souls, skills, memory mirror, session index, and config templates.
- Device registry with WebSocket broadcast.
- Vault RAG proxy with a TTL cache.

## [0.1.0] - 2026-07-24

Phase 0 living skeleton complete.

### Added

- Human login with JWT in an `httpOnly` cookie.
- SAO dashboard with sidebar navigation.
- Agent Hub WebSocket with a real-time roster.
- SQLite tables for agents, agent keys, and agent events.
- `sk-cardinal-*` API keys with a CLI keygen.
- Agent and subagent classification.
- Podman Quadlet deployment with Caddy.
- Reference WebSocket client in `examples/ws-agent.ts`.

## [0.0.1] - 2026-07-23

### Added

- Initial monorepo scaffold for the root, backend, and frontend packages.

[Unreleased]: https://github.com/snattydev/cardinal-system/compare/v0.2.7...dev
[0.2.7]: https://github.com/snattydev/cardinal-system/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/snattydev/cardinal-system/compare/v0.2.0...v0.2.6
[0.2.0]: https://github.com/snattydev/cardinal-system/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/snattydev/cardinal-system/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/snattydev/cardinal-system/releases/tag/v0.0.1
