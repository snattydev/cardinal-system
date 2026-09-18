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
| Operational gotchas | `docs/guides/pitfalls.md` |
| Router usage | `docs/guides/router-usage.md` |
| SAO ecosystem / protocol | `context/ecosystem.md` |

## Dev URLs

Use `127.0.0.1`, never `localhost` (cookie origin).

| Resource | URL / command |
|----------|----------------|
| Frontend | `http://127.0.0.1:5173` |
| Backend | `http://127.0.0.1:8787` (`GET /api/health`) |
| MCP | `http://127.0.0.1:8789` |
| Compose | `podman-compose up -d` / `down` |
| Keygen (container DB) | `podman exec cardinal-backend sh -c 'cd /app && bun run keygen -- --agent <name>'` |

Reference WS client: `CARDINAL_AGENT_KEY=sk-cardinal-... bun examples/ws-agent.ts`.
