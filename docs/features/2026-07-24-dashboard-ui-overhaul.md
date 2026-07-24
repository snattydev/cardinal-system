# Dashboard Fase 0 — UI Overhaul & System Endpoint

> Fecha: 2026-07-24 · Rama: `dev` · Commit: `1be0052`

## Qué se hizo

Segunda iteración sobre la UI del dashboard Fase 0. Se refactorizó la navegación, se agregó un endpoint de sistema, se implementó uptime en vivo, y se self-hostearon las fonts.

## Decisiones

### 1. Sidebar con dropdown "Agents"

**Por qué:** La sidebar plana no escalaba. Con Agents como dropdown colapsable (Hub + Keys disabled "Fase 2"), la navegación queda preparada para el crecimiento del producto sin sobrecargar la barra.

**Alternativa considerada:** Tabs dentro del contenido principal. Descartada porque ensucia el área de contenido y rompe la consistencia de navegación.

### 2. Endpoint `/api/system`

**Por qué:** Overview y Settings necesitaban datos del sistema (uptime, DB stats, counts). Un solo endpoint autenticado que devuelve todo evita múltiples requests y centraliza la lógica.

**Campos:** `version`, `uptime_seconds`, `db_path`, `db_size_bytes`, `agents_total`, `agents_online`, `keys_active`, `keys_revoked`.

### 3. Uptime en vivo client-side

**Por qué:** El uptime del servidor cambia cada segundo — no tiene sentido re-fetchearlo. El backend da el valor base y el frontend lo incrementa con `setInterval`.

**Implementación:** Hook `useSystem()` compartido a nivel módulo. Un solo `sharedBase`, un solo timer. Overview y Settings leen el mismo valor → cero drift entre páginas.

### 4. WebSocket directo al backend

**Por qué:** Vite en Bun crashea el proxy de WebSocket (`socket.destroySoon is not a function`). El frontend no recibía el roster. La solución: `ws.ts` conecta directo a `ws://127.0.0.1:8787/ws`, bypassing el proxy. La cookie JWT (`SameSite=Strict`, `Path=/`) se envía cross-port en localhost.

### 5. Fonts self-hosted

**Por qué:** Eliminar dependencia de Google Fonts (privacidad, performance, offline-ready). Inter y JetBrains Mono como woff2 variables (latin subset) en `frontend/public/fonts/`. 80KB total, cero requests externos.

### 6. Versionado MAJOR.FASE.PATCH

**Por qué:** El formato `vMAJOR.FASE.UPDATE` original era confuso (UPDATE vs PATCH). Se unificó en `MAJOR.FASE.PATCH` donde FASE refleja el roadmap y PATCH es incremental. Ambos docs (CONTEXT.md, AGENTS.md) alineados.

## Archivos creados/modificados

| Archivo | Cambio |
|---------|--------|
| `backend/src/api/system.ts` | Nuevo — endpoint GET /api/system |
| `backend/src/server.ts` | Modificado — registra ruta /api/system |
| `frontend/src/pages/Overview.tsx` | Nuevo — dashboard con stat cards |
| `frontend/src/pages/Agents.tsx` | Nuevo — roster movido desde Home |
| `frontend/src/pages/Settings.tsx` | Reescribo — system info + placeholders Fase 2 |
| `frontend/src/components/Layout.tsx` | Refactor — sidebar con dropdown Agents |
| `frontend/src/App.tsx` | Modificado — nuevas rutas |
| `frontend/src/lib/system.ts` | Nuevo — hook useSystem() compartido |
| `frontend/src/lib/types.ts` | Modificado — interfaz SystemInfo + helpers |
| `frontend/src/lib/ws.ts` | Modificado — WS directo al backend |
| `frontend/index.html` | Modificado — elimina Google Fonts |
| `frontend/src/index.css` | Modificado — @font-face rules |
| `frontend/public/fonts/` | Nuevo — inter.woff2 + jetbrains-mono.woff2 |
| `frontend/src/pages/AgentDetail.tsx` | Modificado — back link a /agents |
| `CONTEXT.md` | Modificado — Fase 0 completa, Fase 1/2 links, versionado |
| `AGENTS.md` | Modificado — tabla de fases, versionado MAJOR.FASE.PATCH |
| `docs/superpowers/specs/` | Nuevo — specs de Fase 1 y Fase 2 |
