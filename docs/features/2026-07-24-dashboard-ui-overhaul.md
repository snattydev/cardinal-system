# Dashboard Fase 0 — UI Overhaul & System Endpoint

> Date: 2026-07-24 · Branch: `dev` · Commit: `1be0052`

## What was done

Second iteration on the Fase 0 dashboard UI. Refactored navigation, added a system endpoint, implemented live uptime, and self-hosted fonts.

## Decisions

### 1. Sidebar with "Agents" dropdown

**Why:** The flat sidebar did not scale. With Agents as a collapsible dropdown (Hub + Keys disabled "Fase 2"), navigation is prepared for product growth without overcrowding the bar.

**Alternative considered:** Tabs within the main content. Discarded because it clutters the content area and breaks navigation consistency.

### 2. `/api/system` endpoint

**Why:** Overview and Settings needed system data (uptime, DB stats, counts). A single authenticated endpoint returning everything avoids multiple requests and centralizes logic.

**Fields:** `version`, `uptime_seconds`, `db_path`, `db_size_bytes`, `agents_total`, `agents_online`, `keys_active`, `keys_revoked`.

### 3. Client-side live uptime

**Why:** Server uptime changes every second — re-fetching it continuously makes no sense. The backend provides the base value and the frontend increments it via `setInterval`.

**Implementation:** Module-level shared `useSystem()` hook. Single `sharedBase`, single timer. Overview and Settings read the same value -> zero drift between pages.

### 4. Direct WebSocket to backend

**Why:** Vite on Bun crashes the WebSocket proxy (`socket.destroySoon is not a function`). The frontend was not receiving the roster. Solution: `ws.ts` connects directly to `ws://127.0.0.1:8787/ws`, bypassing the proxy. The JWT cookie (`SameSite=Strict`, `Path=/`) is sent cross-port on localhost.

### 5. Self-hosted fonts

**Why:** Eliminate Google Fonts dependency (privacy, performance, offline-ready). Inter and JetBrains Mono as variable woff2 (latin subset) in `frontend/public/fonts/`. 80KB total, zero external requests.

### 6. MAJOR.FASE.PATCH versioning

**Why:** The original `vMAJOR.FASE.UPDATE` format was confusing (UPDATE vs PATCH). Unified into `MAJOR.FASE.PATCH` where FASE reflects the roadmap and PATCH is incremental. Both docs (`context/ecosystem.md`, `AGENTS.md`) aligned.

## Created/modified files

| File | Change |
|------|--------|
| `backend/src/api/system.ts` | New — GET /api/system endpoint |
| `backend/src/server.ts` | Modified — registers /api/system route |
| `frontend/src/pages/Overview.tsx` | New — dashboard with stat cards |
| `frontend/src/pages/Agents.tsx` | New — roster moved from Home |
| `frontend/src/pages/Settings.tsx` | Rewritten — system info + Fase 2 placeholders |
| `frontend/src/components/Layout.tsx` | Refactor — sidebar with Agents dropdown |
| `frontend/src/App.tsx` | Modified — new routes |
| `frontend/src/lib/system.ts` | New — shared useSystem() hook |
| `frontend/src/lib/types.ts` | Modified — SystemInfo interface + helpers |
| `frontend/src/lib/ws.ts` | Modified — direct WS to backend |
| `frontend/index.html` | Modified — removes Google Fonts |
| `frontend/src/index.css` | Modified — @font-face rules |
| `frontend/public/fonts/` | New — inter.woff2 + jetbrains-mono.woff2 |
| `frontend/src/pages/AgentDetail.tsx` | Modified — back link to /agents |
| `context/ecosystem.md` | Modified — Fase 0 complete, Fase 1/2 links, versioning |
| `AGENTS.md` | Modified — phases table, MAJOR.FASE.PATCH versioning |
| `docs/superpowers/specs/` | New — Fase 1 and Fase 2 specs |
