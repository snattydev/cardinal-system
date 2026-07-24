# Cardinal System — Contexto del Proyecto

> *El sistema nervioso central del ecosistema SAO. Un monolito que conecta roster, contexto, memoria, automatizaciones, agentes y más — hosteado en VPS, accesible desde cualquier dispositivo.*

---

## 🌐 Visión General

**Cardinal System** es el backend único que orquesta todo el ecosistema de agentes SAO. No es un router de modelos (aunque incluye eso), no es un dashboard (aunque tiene uno). Es **el sistema central** que:

- Conecta todos los agentes sin importar dónde vivan (PC, laptop, celular)
- Provee contexto centralizado (memoria, RAG, historial)
- Emite API keys con scopes, budgets y failsafes (como FreeLLMAPI pero propio)
- Maneja autenticación y acceso humano
- Expone un dashboard web con estética SAO
- Eventualmente: grafo visual de conocimiento, automatizaciones, cron

### Principios

- **Modular** — cada pieza es intercambiable, sin acoplamiento forzado
- **Human-in-the-loop** — la palabra final es siempre de Santiago
- **Agent-less core** — el Cardinal no necesita saber qué es un agente; solo recibe conexiones y sirve contexto
- **Estética SAO** — todo lo visual tiene la identidad de Sword Art Online
- **Seguridad primero** — nada expuesto sin auth, API keys con límites

---

## 🧱 Stack Tecnológico

| Capa | Tecnología | Por qué |
|------|-----------|--------|
| Backend | **TypeScript + Bun** (decidido, sin alternativas) | Un lenguaje para todo, rápido, tipado |
| Frontend | **React + TypeScript + Vite** | Estado complejo, dashboard interactivo |
| Estilos | **Tailwind CSS** | Customizable para tema SAO, sin CSS verboso |
| DB | **SQLite** (`bun:sqlite` de Bun) | Un archivo, cero infra |
| WS | **WebSocket nativo** (`Bun.serve`) | Agents reportan estado en tiempo real |
| Deploy | **Podman Quadlet + Caddy** | Como Vaultwarden, reverse proxy automático |
| Auth humana | **JWT** (admin por variables de entorno) | Simple, stateless |
| Auth de agentes | **API key OpenAI-compatible** (`sk-cardinal-*`) | La key ES la identidad del agente |



## 🏗️ Arquitectura por Capas

```
                        snatty.dev
                            │
             ┌──────────────┴──────────────┐
             │       CARDINAL SYSTEM        │
             │                              │
             │  ┌─── ACCESS / AUTH ──────┐  │
             │  │  • Login (user+pass)   │  │
             │  │  • JWT sessions        │  │
             │  │  • API Key Factory     │  │  ← Fase 2
             │  │  • Budget enforcement  │  │  ← Fase 2
             │  └────────────────────────┘  │
             │                              │
             │  ┌─── CORE SERVICES ──────┐  │
             │  │  • Agent Hub (WS)      │  │
             │  │  • Model Router        │  │  ← Fase 2
             │  │  • Memory Store        │  │  ← Fase 1
             │  │  • Vault RAG           │  │  ← Fase 1
             │  │  • Session History     │  │  ← Fase 1
             │  │  • Cron/Automations    │  │  ← Fase 4
             │  └────────────────────────┘  │
             │                              │
             │  ┌─── PRESENTATION ───────┐  │
             │  │  • Dashboard SAO UI    │  │
             │  │  • Agent roster view   │  │
             │  │  • API Key management  │  │  ← Fase 2
             │  │  • Consumption stats   │  │  ← Fase 2
             │  │  • Knowledge Graph     │  │  ← Fase 3
             │  └────────────────────────┘  │
             └──────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
      ┌───┴───┐   ┌────┴────┐   ┌───┴───┐
      │  PC   │   │ Laptop  │   │ Celular│
      │Shinon │   │ Kirito  │   │ Termux │
      │Asuna  │   │ (one-off│   │ (futuro│
      │Eugeo  │   │ agents) │   │ agente)│
      └───────┘   └─────────┘   └───────┘
```

**Concepto clave:** Los nombres (Shinon, Kirito, Asuna, Eugeo) son **skins/interfaces cosméticas** para los agentes que viven físicamente en dispositivos. El mismo agente físico puede tener distintas skins según el contexto. El Cardinal no interpreta la *semántica* de la skin — solo la registra y la muestra.

**Clasificación:** los agentes con `device == "localhost"` (one-shot, subagentes internos) se clasifican como **subagent** por defecto y NO aparecen en la grilla principal del dashboard, salvo que el humano lo haya seteado explícitamente al crear su key (`kind_override`). Solo los agentes de dispositivos externos (PC, laptop, celular) van al Hub principal.

---

## 📡 Agent Protocol

Los agentes se conectan **solos** al Cardinal mediante WebSocket. **No hay SDK**: el protocolo es el contrato y cualquier websocket normal sirve (el repo incluye `examples/ws-agent.ts` como referencia).

### Identidad

Cada agente tiene su propia **API key OpenAI-compatible** (`sk-cardinal-*`) emitida por el Cardinal (CLI `keygen`). **La key ES la identidad**: el `hello` la presenta y el Cardinal deriva el nombre del agente de ella — no se puede suplantar otra identidad. En DB solo se guarda el hash SHA-256. La misma key autenticará los requests LLM al router en Fase 2.

### Flujo de conexión

1. Al arrancar, el agente envía `hello` con su key al Cardinal vía WS
2. El Cardinal valida la key, lo registra, responde `welcome` y lo muestra en el dashboard
3. El Cardinal envía `ping` cada 30s; el agente responde `pong` (offline si 2 pings sin respuesta)
4. Al cerrar, el agente envía `bye`

### Mensajes WS

```
# Rol agente
→ { type: "hello", key: "sk-cardinal-...", device: "pc", status: "idle" }
← { type: "welcome", agent: "shinon", kind: "agent" }
← { type: "error", reason: "auth_failed" }  (+ close 4401)
← { type: "ping" }
→ { type: "pong",  status: "busy" }
→ { type: "bye" }

# Rol dashboard (humano)
# (upgrade HTTP autenticado por cookie httpOnly del login; el JS nunca lee el JWT)
→ { type: "subscribe" }
← { type: "roster", agents: [...] }
← { type: "agent_update", agent: {...} }
```

### Patrón clave: agent-less core

El Cardinal **no necesita saber qué es un agente**. Solo maneja conexiones, sesiones, y contexto. Los agentes consumen del Cardinal (RAG, memoria, router) y se reportan a él. No hay "orquestación" desde el Cardinal — los agentes piden, el Cardinal sirve. **En Fase 0 el Cardinal es pasivo: no existe mensaje `task` ni ningún mensaje que inicie trabajo en el agente.**

---

## 🖥️ Dashboard — Vistas Planeadas

### Sidebar (navegación principal)
- **🏠 Home** — Agent Hub principal
- **🤖 Agents** — Detalle de cada agente
- **🔑 API Keys** — Gestión de keys (Fase 2)
- **📊 Stats** — Consumos, históricos (Fase 2)
- **🕸️ Graph** — Grafo de conocimiento (Fase 3)
- **⚙️ Settings** — Configuración

### a) Login
- Pantalla estilo SAO (portón, geometrías, animaciones)
- User + pass, genera JWT
- Transición al dashboard

### b) Agent Hub (Home)
- Grilla con avatares de cada agente conectado — **solo `kind=agent`** (dispositivos externos)
- Cada uno muestra: nombre, skin, device, estado (online/idle/busy), última actividad
- Agents offline aparecen atenuados
- Sección colapsable "Subagents" para `kind=subagent` (localhost)
- Click → panel expandido con detalle
- Footer del sidebar muestra la **versión** del sistema (de `/api/health`)

### c) Detalle de agente
- Stats (tokens, tareas completadas, uptime)
- Historial reciente (eventos connect/disconnect/status)
- Live log / consola
- ~~Botón para enviarle una tarea~~ → fase posterior (en Fase 0 el Cardinal es pasivo)

### d) Settings
- Info de cuenta y versión del sistema
- Tema (SAO dark, variantes)
- ~~Cambiar contraseña~~ → en Fase 0 el admin vive en variables de entorno; el cambio es editar env + restart

---

## 🗺️ Roadmap por Fases

### ✅ Fase 0 — Esqueleto Vivo (COMPLETA — 2026-07-23)
|- Login + JWT (admin por variables de entorno)
|- Dashboard SAO con sidebar
|- Agent Hub (WebSocket, roster en tiempo real)
|- **DB mínima (SQLite):** `agents`, `agent_keys`, `agent_events`
|- **API keys por agente** (`sk-cardinal-*`, CLI `keygen`: create/revoke/list) — precursor de la Key Factory
|- Clasificación agent/subagent (localhost → subagent salvo override del humano)
|- Caddy reverse proxy en VPS
|- Deploy con Podman Quadlet
|- **Valor:** ver el sistema vivo, agents conectándose

> Spec: [`docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md) ✅

### Fase 1 — Context Store Central (diseñada)
|- Vault Context Service (agents consultan contexto centralizado)
|- Vector Store (sqlite-vec o similar)
|- Session History store
|- Cada agente one-shot deja su output en memoria
|- **Valor:** los agents ya no dependen del vault local; el Cardinal es la fuente de contexto

> Spec: [`docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md`](./docs/superpowers/specs/2026-07-23-cardinal-context-store-design.md) 📋

### Fase 2 — API Key Factory + Model Router + One-shot Agents (diseñada)
|- Endpoint **OpenAI-compatible** (`/v1/chat/completions`) autenticado con las mismas `sk-cardinal-*` (la key ya es la identidad desde Fase 0)
|- Generar API keys con scopes (lectura/escritura por servicio)
|- Budgets por key (límite de tokens/tiempo/dinero)
|- Model routing según tarea (pesada → pro, ligera → flash)
|- Failsafes: si se pasa del budget, denegar automáticamente
|- Dashboard de consumo por key
|- **Orquestación de contenedores** (Podman/Docker API compatible) con recursos mínimos para ejecutar **agentes one-shot** con modelo específico según el tipo de tarea
|- **Keys dinámicas para localhost**: el sistema crea y revoca keys `created_by='system'` para los one-shot; las `created_by='human'` jamás se tocan salvo acción explícita del humano
|- **Valor:** el Cardinal reemplaza a FreeLLMAPI como router central, con control granular

> Spec: [`docs/superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md`](./docs/superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md) 📋

### Fase 3 — Grafo de Conocimiento
- Visualización tipo Obsidian Graph pero en web
- Conexiones entre: sesiones → agentes → memorias → decisiones → vault notes
- Cada agente one-shot que se ejecuta deja un nodo en el grafo
- **Valor:** entender visualmente cómo se relaciona todo el conocimiento del ecosistema

### Fase 4+ — Automations
- Cron interno del Cardinal
- Webhooks
- Disparadores por eventos (cuando un agente termina tarea X, ejecutar Y)
- **Valor:** automatizaciones sin depender de la gateway local

---

## 🔢 Versionado

Formato `vMAJOR.FASE.UPDATE`:
- **MAJOR**: `0` hasta que el sistema supere todas las fases de testing y se declare producto **estable** → `1`
- **FASE**: fase actual del roadmap (0, 1, 2, ...)
- **UPDATE**: se incrementa con **cada update** del proyecto dentro de la fase

Reglas:
- Source of truth: campo `version` del `package.json` raíz
- El backend la expone en `GET /api/health`; el dashboard la muestra en el footer del sidebar
- Versión inicial: **v0.0.1**

---

## 🧠 Conceptos Clave

### Del onboarding-ia de Agustin Diez

Referencia: https://nogal-labs.com.ar/onboarding-ia/ — presentación en Nodo Serrano, Tandil.

| Concepto | Descripción | Aplica al Cardinal |
|----------|-------------|-------------------|
| **LLM = genio con amnesia** | Sabe todo del mundo, olvida tu proyecto cada sesión | El Cardinal es la memoria permanente que compensa la amnesia |
| **Contexto > Prompt** | El prompt es la punta del iceberg | Cardinal provee el contexto rico; los prompts pueden ser mínimos |
| **Extraer ≠ Resumir** | Resumir achica, extraer estructura | Los agentes deberían extraer conocimiento, no resumir |
| **MCP = USB-C de IA** | Protocolo estándar agente ↔ herramientas | El Cardinal expone servicios que los agents consumen vía API/WS |
| **Skills = on-demand** | Procedimientos que se cargan cuando hacen falta | Skills unificadas desde el Cardinal |
| **Rules = permanente** | Comportamiento siempre activo | Reglas base del ecosistema |
| **Ventana vs Memoria** | Ventana = RAM de la sesión, Memoria = disco del proyecto | Cardinal es el disco; la ventana vive en cada agente |

### De la charla Nogal Hive (Agustin Diez, Julio 2026)

Referencia completa: [`docs/references/nogal-hive-charla.md`](docs/references/nogal-hive-charla.md) — anatomía de una plataforma multi-agente en producción.

**Lecciones directas para el Cardinal:**

| # | Lección | Aplica en |
|---|---------|-----------|
| 1 | **Verificar claims contra el mundo real** — los agentes alucinan éxito ("PR listo", "branch pusheado") | Fase 2: todo one-shot agent debe tener verify-step |
| 2 | **Permisos por capacidad física, no por prompt** — token scoped, fork model, filesystem restringido | Fase 2: API Key Factory + Podman sin mounts del host |
| 3 | **Efímero por default** — el estado en git/DB, nunca en el proceso | Fase 2: containers one-shot, siempre `finally: rm` |
| 4 | **Cada token atribuible** — metering por run, costo real en feed | Fase 2: Model Router debe exponer consumo por key |
| 5 | **Humano cierra cada loop** — merge, confirmación, gates | Principio fundacional (ya en diseño) |
| 6 | **⚠️ Doble sandbox** — si Hermes dentro de container, sandbox interno OFF | Fase 2: configuración de workers |
| 7 | **⚠️ Tool-calling en proxies** — OpenAI-compat puede descartar tools | Fase 2: Model Router debe validar passthrough |
| 8 | **⚠️ Dedup a nivel DB** — tool calls paralelos pueden crear tasks duplicadas | Fase 2: índice único parcial en tabla de tasks |
| 9 | **💡 Default al modelo caro** — tiempo humano revisando > tokens ahorrados | Fase 2: tier system con opus/sonnet/haiku |
| 10 | **💡 Review bot one-shot** — un PR = una review, no re-dispara | Fase 4+: automatizaciones con HITL

---

## 📁 Estructura del Repositorio (propuesta)

```
cardinal-system/
├── backend/
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── auth/             # Login, JWT
│   │   ├── keys/             # API keys de agentes + CLI keygen
│   │   ├── ws/               # WebSocket handler (agent protocol)
│   │   ├── api/              # REST endpoints
│   │   ├── db/               # SQLite schema + migrations
│   │   ├── rag/              # Vector store, embeddings (Fase 1)
│   │   ├── router/           # Model routing (Fase 2)
│   │   └── graph/            # Knowledge graph (Fase 3)
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/            # Login, Home, AgentDetail, Settings...
│   │   ├── components/       # SAO-themed UI components
│   │   ├── hooks/            # WS connection, auth state
│   │   └── lib/              # api client, ws client
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── examples/
│   └── ws-agent.ts           # Cliente WS genérico de referencia (no es SDK)
├── deploy/
│   ├── Containerfile         # Podman multi-stage (un contenedor sirve todo)
│   ├── Caddyfile.example
│   └── quadlet/              # .container + .volume archivos
├── docs/
│   ├── references/            # Referencias externas (charlas, papers, arquitecturas)
│   └── superpowers/specs/    # Specs de diseño por fase
├── package.json              # Monorepo root (workspaces) — version = source of truth
└── README.md
```

---

## 🎨 Estética SAO — Lineamientos Visuales

- **Fondo:** azul muy oscuro (#0a0e27, #08070c)
- **Acento primario:** cyan brillante (#00d4ff, #7ED3C1)
- **Acento secundario:** violeta metálico (#8b5cf6)
- **Geometrías:** paneles con bordes, líneas finas, divisores luminosos
- **Tipografía:** monoespaciada (JetBrains Mono) + sans (Inter)
- **Avatares:** circulares con glow del color del agente
- **Transiciones:** limpias, con glow, sin exageración
- Referencia visual: menú de Sword Art Online (paneles hexagonales/rectangulares con brillos)

---

## 🔗 Referencias

- [Charla "Nogal Hive: Anatomía de una plataforma multi-agente" — Agustin Diez](https://nogal-labs.com.ar/hive-charla/) · [Notas internas](docs/references/nogal-hive-charla.md)
- [Presentación "El contexto es el producto" — Agustin Diez](https://nogal-labs.com.ar/onboarding-ia/)
- [GitHub de Agustin Diez](https://github.com/agusisa)
- [Nogal Hive (plataforma en producción)](https://nogal-labs.com.ar/hive)
- FreeLLMAPI: http://127.0.0.1:3001/ (inspiración para API Key Factory)
- Hermes Agent: https://hermes-agent.nousresearch.com/docs

---

*Este documento es vivo. Se actualiza a medida que las decisiones arquitectónicas se solidifican.*
