# Cardinal Context Hub v2 (MCP)

Reworked `packages/mcp` into a security-hardened, usage-tracked Streamable HTTP MCP Context Hub inspired by `rampup` principles (zero-LLM deterministic onboarding, progressive disclosure, strict read/write separation, and usage-gated evolution).

## What Changed

- **Official MCP SDK & Streamable HTTP (`packages/mcp/src/server.ts`):**
  Replaced the hand-rolled JSON-RPC loop with `@modelcontextprotocol/sdk` (`McpServer` + `WebStandardStreamableHTTPServerTransport`) in per-request stateless mode so caller identities never bleed across sessions.
- **Path-Glob ACL Engine (`packages/mcp/src/acl.ts`):**
  - Supports fine-grained `vault:read:<glob>`, `vault:write:<glob>`, `board:*`, `mailbox:*`, and `vault:allow-personal` scopes.
  - **Hard invariant:** `personal/**` (and configured `CARDINAL_DENY_PREFIXES`) is unconditionally denied to all agent keys—even wildcard `*`—unless the key explicitly carries both `vault:allow-personal` and a matching `vault:read:` scope. Writes to `personal/**` are always denied.
  - **Hard invariant:** `*` never grants write access.
- **Physical Read/Write Isolation (`packages/mcp/src/vaults.ts`, `writer.ts`):**
  - Source vaults mount strictly read-only (`:ro` at `/data/vaults`).
  - Agent outputs (`cardinal_handoff`, `cardinal_propose_skill`) write only to an isolated writable directory (`CARDINAL_WRITABLE_ROOT=/data/agent-state`) with slug validation, symlink checks, atomic writes, and optional single-file local Git auto-commits.
- **Zero-Dependency FTS5 Search + Optional QMD Sidecar (`packages/mcp/src/search.ts`):**
  - Built-in SQLite FTS5 (`porter unicode61`, BM25 ranking, sanitized query parser, post-query ACL filtering) replaces the old host-coupled Python RAG proxy.
  - Optional `QMD_URL` sidecar (`compose.yaml` `--profile qmd`) enables local GGUF embeddings/reranking with automatic fallback to FTS5 if unavailable.
- **Deterministic Zero-LLM Onboarding & New-Repo Bootstrap (`packages/mcp/src/onboard.ts`, `bootstrap.ts`):**
  - `cardinal_onboard` prompt & tool support `mode: "coding" | "hermes"`, building a bounded markdown packet + two-level readable topic map without calling any LLM.
  - `hermes` mode skips `SOUL.md` and `USER.md` so Hermes keeps ownership of its own profile files.
  - `cardinal_bootstrap_repo` prompt & tool ("Configuration 101") assemble conduct rules, starter `AGENTS.md` / `.github/PULL_REQUEST_TEMPLATE.md` boilerplate, and portable workflow skills resolved via caller ACLs from `/data/vaults` (presets: `default`, `prd`, `minimal`, `list`, plus optional `cardinal-system/bootstrap.md` manifest), delivering skills like `caveman`, commit/PR workflows, and Matt Pocock planning/architecture skills without client-side installs.
- **Sanitized Config Read Tools (`packages/mcp/src/configs.ts`, `redact.ts`, `scripts/sync-configs.sh`):**
  - `cardinal_agent_config` exposes allowlisted, secret-redacted agent harness configs under `/data/configs/agents` (OpenCode, OMP, AGY, Cursor, Claude, Codex, Hermes, RTK) when caller holds `*` or `config:read:agents/**`.
  - `cardinal_user_config` exposes allowlisted, secret-redacted terminal/shell/personal configs under `/data/configs/user` (Kitty, Alacritty, Foot, Ghostty, Fish, Zsh, Bash, Starship, Git, Tmux, Zellij) strictly opt-in via explicit `config:read:user/**` (never granted by `*` or `config:read:*`).
  - `scripts/sync-configs.sh` snapshots only non-sensitive allowlisted files from `$HOME` with dual-layer stream redaction; runtime reads also block credential filenames (`auth*`, `.env*`, `*token*`, `*secret*`, keys, sqlite, histories), binaries, and symlinks before returning text.
- **Usage Telemetry & Scope Enforcement (`backend/src/api/mcp-usage.ts`, `packages/db/src/schema.ts`):**
  - Migration #15 adds `mcp_usage`, updated non-blockingly via `POST /api/internal/mcp/usage`.
  - `GET /api/system` surfaces `mcp_calls_7d`, `mcp_calls_30d`, and `mcp_last_call_at` to evaluate the 30-day usage gate.
  - Board and mailbox endpoints (`/api/tasks*`, `/api/messages*`) enforce `board:*` and `mailbox:*` scopes on agent keys.

## MCP Surface

- **Prompts:** `cardinal_onboard(mode?, project?)`, `cardinal_bootstrap_repo(preset?, project?, stack?, skills?)`
- **Context tools (when caller has readable vault scopes):**
  - `cardinal_onboard(mode?, project?)`
  - `cardinal_bootstrap_repo(preset?, project?, stack?, skills?, extra_skills?, include_starter_files?, max_bytes?)`
  - `cardinal_list(prefix?, depth?)`
  - `cardinal_search(query, prefix?, top_k?)`
  - `cardinal_read(path, max_bytes?)`
- **Config tools (when `CARDINAL_CONFIGS_ROOT` is set and caller scopes match):**
  - `cardinal_agent_config(action?, path?, prefix?, depth?, max_bytes?)` (`*` or `config:read:agents/**`)
  - `cardinal_user_config(action?, path?, prefix?, depth?, max_bytes?)` (explicit `config:read:user/**` only)
- **Sandboxed write tools (when `CARDINAL_WRITABLE_ROOT` is set and caller has matching `vault:write:` scope):**
  - `cardinal_handoff(project, summary, next_steps?, refs?)`
  - `cardinal_propose_skill(skill_path, reason, content)`
- **Optional board/mailbox tools:** exposed only when key carries `board*` or `mailbox*` scopes.

## Key Generation Examples

Create a least-privilege key for stateless coding harnesses (Claude Code, Codex, Cursor, OpenCode, T3 Code):

```bash
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- \
  --agent coding-harness \
  --kind agent \
  --scope "vault:read:cardinal-system/**" \
  --scope "vault:read:skills/**" \
  --scope "vault:read:projects/**" \
  --scope "vault:read:agents/**" \
  --scope "config:read:agents/**" \
  --scope "vault:write:agents/handoffs/**" \
  --scope "vault:write:agents/proposals/**"'
```

Opt in separately to personal terminal/shell configs only on trusted local workstations:

```bash
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- \
  --agent workstation-user \
  --kind agent \
  --scope "vault:read:cardinal-system/**" \
  --scope "vault:read:skills/**" \
  --scope "config:read:agents/**" \
  --scope "config:read:user/**"'
```

Create a key for Hermes (excludes `USER.md` / `SOUL.md` duplication via `mode=hermes`):

```bash
podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- \
  --agent hermes-profile \
  --kind agent \
  --scope "vault:read:cardinal-system/**" \
  --scope "vault:read:projects/**" \
  --scope "vault:read:agents/**" \
  --scope "vault:write:agents/handoffs/**"'
```

## Client Configuration & Tailnet Exposure

Expose loopback port `8789` privately across your devices with Tailscale Serve:

```bash
tailscale serve --bg --https=8789 http://127.0.0.1:8789
```

Generic Streamable HTTP MCP client config:

```json
{
  "mcpServers": {
    "cardinal": {
      "type": "http",
      "url": "http://127.0.0.1:8789/mcp",
      "headers": {
        "Authorization": "Bearer sk-cardinal-YOUR_KEY"
      }
    }
  }
}
```

## Checking the 30-Day Usage Gate

Query `GET /api/system` with an authenticated dashboard session to review real usage:

```json
{
  "mcp_calls_7d": 42,
  "mcp_calls_30d": 118,
  "mcp_last_call_at": "2026-11-25 04:20:00"
}
```
