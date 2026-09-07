# Phase 0 — Living Skeleton

> Completed: 2026-07-23 · Spec: [`../superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](../superpowers/specs/2026-07-23-cardinal-fase-0-design.md)

---

## Completed Tasks

| # | Task | Verification |
|---|------|--------------|
| 1 | Human login + JWT (admin via env) | `POST /api/auth/login` → cookie |
| 2 | SAO dashboard with sidebar | `http://127.0.0.1:5173` |
| 3 | Agent Hub WS (real-time roster) | `wscat -c ws://127.0.0.1:8787/ws` |
| 4 | DB: agents, agent_keys, agent_events | SQLite via `bun:sqlite` |
| 5 | API keys `sk-cardinal-*` + CLI keygen | `bun run keygen -- --agent <name>` |
| 6 | Agent/subagent classification | `device=localhost` → subagent |
| 7 | Podman Quadlet deploy + Caddy | `deploy/quadlet/` |
| 8 | `examples/ws-agent.ts` | Reference WS client |

---

## What was NOT done (out of scope for F0)

- Task dispatch to agents (task message)
- `/v1/chat/completions` endpoint
- One-shot container orchestration
- RAG / memory / session history
- Rate limiting
- Multi-user

---

## Lessons Learned

- **Broken Vite WS proxy in Bun:** frontend WS → directly to backend (`:8787`), not through Vite
- **keygen path:** `podman exec ... bun run keygen -- ...`, not `bun run /app/backend/...`
- **Truncation of long keys:** redirect to file + `od` to capture in full
- **Pod infra=false breaks port forwarding:** `podman-compose down && up -d`
- **Type mismatch frontend↔backend = black screen:** verify actual JSON response before typing
