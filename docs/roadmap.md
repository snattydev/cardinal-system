# Cardinal System — Roadmap

> Updated: 2026-11-25. Single source of truth for priorities.

---

## Now: Context Hub v2 (Stage 1 — usage-gated)

Tracking issue: [#62](https://github.com/snattydev/cardinal-system/issues/62). Feature doc: [`docs/features/2026-11-25-mcp-context-hub-v2.md`](features/2026-11-25-mcp-context-hub-v2.md).

Cardinal pivots to a **Sovereign Context Policy Plane + Usage-Gated MCP Hub**, stopping work on commodity infrastructure (custom LLM router expansion, Podman maintenance workers, Tasks v2 triggers, and custom Web TUIs) in favor of composing existing harnesses (T3 Code, Claude Code, Codex, Cursor, OpenCode, Hermes) and optional search sidecars (QMD).

### Stage 1 — Usage-Proving MVP (branch `feature/mcp-context-hub`)

- **Streamable HTTP MCP Hub (`packages/mcp`):** Built on `@modelcontextprotocol/sdk` (`McpServer` + `WebStandardStreamableHTTPServerTransport`) in per-request stateless mode (`POST /mcp`, `GET /health`).
- **Path-Glob ACL & Physical R/W Separation ([#22](https://github.com/snattydev/cardinal-system/issues/22)):** `vault:read:<glob>`, `vault:write:<glob>`, `vault:allow-personal`, unconditional `personal/**` protection, `:ro` source vaults, and `:rw` isolated `agent-state` (`cardinal_handoff`, `cardinal_propose_skill`) with optional single-file local Git commits.
- **Built-in SQLite FTS5 + Optional QMD Sidecar ([#44](https://github.com/snattydev/cardinal-system/issues/44)):** Zero-dependency BM25 search with sanitized queries, post-query ACL filtering, and optional `--profile qmd` sidecar with seamless FTS5 fallback.
- **Deterministic Zero-LLM Onboarding:** `cardinal_onboard` prompt & tool with `coding` vs `hermes` modes and a two-level readable topic map.
- **Usage Telemetry & Route Scopes ([#48](https://github.com/snattydev/cardinal-system/issues/48)):** `mcp_usage` migration (#15), `POST /api/internal/mcp/usage`, `GET /api/system` telemetry counters, and `board:*`/`mailbox:*` scope enforcement on `/api/tasks*` + `/api/messages*`.

### 30-Day Usage Gate

Evaluate real usage after 2–4 weeks via `GET /api/system`:
- `mcp_calls_7d`
- `mcp_calls_30d`
- `mcp_last_call_at`

If real weekly usage does not materialize, archive cleanly instead of investing further effort.

### Frozen / Delegated to Commodities

- Custom LLM router expansion (use BYO subscriptions or a Bifrost sidecar if ever needed)
- Internal Podman workers (N1), Tasks v2 worker triggers (N2), custom `ttyd` Web TUI (N4) — tracking issues `#21`, `#23`–`#28` closed as superseded by `#62`

### Stage 2 — Conditional on 30-Day Gate

- **2A — Passive SAO Overview:** Ingest hook / OTel events (`POST /api/events/ingest`) so the existing SAO Agent Hub updates automatically.
- **2B — Optional Sidecars:** Add Bifrost (if unified billing/routing is needed) or Graphiti/Mem0 (if markdown handoffs + QMD prove insufficient).
- **2C — SAO `Ctrl+K` Spotlight:** Fast command palette over QMD search and usage telemetry.
- **Public Extraction:** Extract `packages/mcp` into a clean standalone public repository once proven in daily use.

---

## Phases

| Phase | Name | Status | Roadmap |
|-------|------|--------|---------|
| 0 | Living Skeleton | Complete | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | Complete (v0.2.0) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | Blackboard + MCP + Pool | Complete (`v0.2.6` on `main`; N1 merged on `dev`) | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| **Hub v2** | **Context Hub v2 (Stage 1 — usage-gated)** | **Active (`feature/mcp-context-hub`, [#62](https://github.com/snattydev/cardinal-system/issues/62))** | [`docs/features/2026-11-25-mcp-context-hub-v2.md`](features/2026-11-25-mcp-context-hub-v2.md) |
| Hub v2+ | Stage 2 (OTel ingest, optional sidecars, public extract) | Gated on 30-day usage | [#62](https://github.com/snattydev/cardinal-system/issues/62) |

---

## Conventions

- **Versioning:** `MAJOR.FASE.PATCH` (source: `package.json`)
- **Language:** English only (docs, skills, comments, commits, PRs) — `AGENTS/docs.md`
- **Commits:** Conventional Commits (English ≤72 chars, English body)
- **Branches:** `feature/* → dev → main` (merge commit)
- **TDD:** Required for core. Not for frontend/docs
- **Agents:** Names outside the repo. Roles only
- **Context:** `context/` → knowledge base. `AGENTS.md` → dev rules

---

*Updated when priorities change or a phase completes.*
