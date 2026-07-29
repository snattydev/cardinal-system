# Fase 0 — Esqueleto Vivo ✅

> Completada: 2026-07-23 · Spec: [`../superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](../superpowers/specs/2026-07-23-cardinal-fase-0-design.md)

---

## Tareas completadas

| # | Tarea | Verificación |
|---|-------|-------------|
| 1 | Login humano + JWT (admin por env) | `POST /api/auth/login` → cookie |
| 2 | Dashboard SAO con sidebar | `http://127.0.0.1:5173` |
| 3 | Agent Hub WS (roster en tiempo real) | `wscat -c ws://127.0.0.1:8787/ws` |
| 4 | DB: agents, agent_keys, agent_events | SQLite via `bun:sqlite` |
| 5 | API keys `sk-cardinal-*` + CLI keygen | `bun run keygen -- --agent <name>` |
| 6 | Clasificación agent/subagent | `device=localhost` → subagent |
| 7 | Deploy Podman Quadlet + Caddy | `deploy/quadlet/` |
| 8 | `examples/ws-agent.ts` | Cliente WS de referencia |

---

## Lo que NO se hizo (fuera de scope F0)

- Despacho de tareas a agentes (task message)
- Endpoint `/v1/chat/completions`
- Orquestación de contenedores one-shot
- RAG / memoria / historial de sesiones
- Rate limiting
- Multi-usuario

---

## Lecciones aprendidas

- **Vite WS proxy roto en Bun:** frontend WS → directo a backend (`:8787`), no por Vite
- **keygen path:** `podman exec ... bun run keygen -- ...`, no `bun run /app/backend/...`
- **Truncado de keys largas:** redirigir a archivo + `od` para capturar completas
- **Pod infra=false rompe port forwarding:** `podman-compose down && up -d`
- **Type mismatch frontend↔backend = black screen:** verificar JSON response real antes de tipar
