---
name: cardinal-system
description: Technical loop for Cardinal System — runtime, keys, WebSocket, API, dashboard quirks. Complements cardinal-dev. Use when debugging, calling the API, or running the stack.
category: development
---

# Cardinal System — Technical Loop

Do not paste stack, branching, or TDD here. Those live in `AGENTS.md`.

| Need | Where |
|------|--------|
| Human getting started | `README.md` |
| Stack decisions | `docs/stack.md` |
| Security model | `docs/security.md` |
| REST + WS + JWT recipe | `docs/api.md` |
| Context Hub v2 (MCP) | `docs/features/2026-11-25-mcp-context-hub-v2.md` |
| Operational gotchas | `docs/guides/pitfalls.md` |
| Router usage | `docs/guides/router-usage.md` |
| SAO ecosystem / protocol | `context/ecosystem.md` |

## Dev URLs

Use `127.0.0.1`, never `localhost` (cookie origin).

| Resource | URL / command |
|----------|----------------|
| Frontend | `http://127.0.0.1:5173` |
| Backend | `http://127.0.0.1:8787` (`GET /api/health`, `GET /api/system`) |
| MCP Hub | `http://127.0.0.1:8789/mcp` (`GET /health`, Streamable HTTP, Bearer `sk-cardinal-*`) |
| Compose | `podman-compose up -d` / `down` (optional `--profile qmd`) |
| Config sync | `bash scripts/sync-configs.sh` (populates sanitized `./configs/{agents,user}` for `/data/configs:ro`) |
| Keygen (container DB) | `podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --agent <name> --scope "vault:read:..."'` |

Reference WS client: `CARDINAL_AGENT_KEY=sk-cardinal-... bun examples/ws-agent.ts`.
