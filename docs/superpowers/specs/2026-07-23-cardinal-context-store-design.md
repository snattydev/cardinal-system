# Cardinal System — Context Store Central: Diseño y Roadmap

> **Fecha:** 2026-07-23 · **Versión:** v0.1.0-draft
> **Contexto:** Diseño post-Fase 0. El Cardinal ya tiene esqueleto vivo (WS Hub, API keys, dashboard). Ahora se convierte en el **Context Store central** del ecosistema SAO.
> **Visión del usuario:** "El cardinal system guarda contexto de todo y los agentes míos que cree en dispositivos consumen de ahí y hacen su onboarding."

---

## 1. Situación Actual (Antes del Cambio)

```
┌─────────────────────────────────────────────────────────┐
│                    ECOSISTEMA HOY                        │
│                                                         │
│  Cada perfil Hermes es una ISLA                          │
│                                                         │
│  PC de Santi                                            │
│  ├── Shinon (default)                                   │
│  │   ├── state.db (sesiones, mensajes)                  │
│  │   ├── memories/MEMORY.md, USER.md                    │
│  │   └── skills/ (~50 skills)                           │
│  ├── Asuna (asuna)                                      │
│  │   ├── state.db (sesiones propias)                    │
│  │   ├── memories/ (memoria de Asuna)                   │
│  │   └── profile/config.yaml                            │
│  └── Eugeo (eugeo)                                      │
│       ├── state.db                                      │
│       ├── memories/                                     │
│       └── profile/config.yaml + gateway Telegram        │
│                                                         │
│  Cardinal Fase 0 (fuera del loop)                       │
│  └── WS Hub + Dashboard + API keys                      │
│      (solo ve conectividad — NO contexto)               │
│                                                         │
│  Vault RAG (separado)                                   │
│  └── vault-query CLI → sqlite-vec + FTS5                │
│      (solo accesible desde terminal del perfil local)   │
│                                                         │
│  Laptop, Celular: NO EXISTEN en el mapa                 │
└─────────────────────────────────────────────────────────┘
```

**Problemas:**
- Cada perfil Hermes reinventa su contexto — no hay un source of truth compartido
- Un agente nuevo no sabe quién es, qué skills tiene, cómo comportarse
- La memoria del agente A no es visible para el agente B
- El vault RAG solo es accesible desde el PC local
- No hay onboarding: si mañana creás un agente en la laptop, arranca de cero

---

## 2. Visión: Cardinal como Context Store Central

```
┌─────────────────────────────────────────────────────────────┐
│                    CARDINAL SYSTEM                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CONTEXT STORE (source of truth del ecosistema)     │    │
│  │                                                     │    │
│  │  📋 Profile Registry        → qué agentes existen   │    │
│  │  📜 SOUL Registry           → personalidad de cada  │    │
│  │  🛠️ Skill Catalog           → qué skills tiene cada │    │
│  │  🧠 Memory Mirror           → MEMORY.md/USER.md     │    │
│  │  💬 Session Index           → historial de sesiones │    │
│  │  📚 Vault RAG Proxy         → búsqueda semántica    │    │
│  │  ⚙️ Config Templates        → config.yaml por perfil│    │
│  │  🗺️ Device Registry         → qué corre dónde       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  AGENT   │  │  AGENT   │  │  AGENT   │  │  HUMAN    │  │
│  │  Shinon  │  │  Asuna   │  │  Eugeo   │  │  (Me)     │  │
│  │  (PC)    │  │  (PC)    │  │  (PC)    │  │ Dashboard │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
│         ▲            ▲            ▲              ▲         │
│         └────────────┴────────────┴──────────────┘         │
│                   WebSocket + REST API                      │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  AGENT   │  │  AGENT   │  │  AGENT   │                  │
│  │  Kirito  │  │ Lisbeth  │  │  Klein   │                  │
│  │  (Laptop)│  │ (Laptop) │  │ (Celular)│                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Qué Almacena el Context Store

### 3.1 Profile Registry (`profiles`)

Registro maestro de todos los perfiles Hermes que existen en el ecosistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | TEXT PK | Nombre del perfil (shinon, asuna, eugeo, kirito...) |
| `display_name` | TEXT | Nombre legible ("Shinon") |
| `emoji` | TEXT | 🏹 🌸 🌷 ⚔️ 🔧 etc. |
| `kind` | TEXT | `permanent` o `one-shot` |
| `status` | TEXT | `active`, `dormant`, `liberated` |
| `model_default` | TEXT | Modelo por defecto |
| `provider_default` | TEXT | Provider por defecto |
| `device` | TEXT | Host físico actual |
| `last_onboarded` | TEXT | Última vez que hizo onboarding |
| `created_at` / `updated_at` | TEXT | Timestamps |

### 3.2 SOUL Registry (`souls`)

La personalidad de cada agente — su SOUL.md centralizado.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `profile_name` | TEXT PK → profiles(name) |
| `soul_md` | TEXT | Contenido completo del SOUL.md |
| `personality_tags` | TEXT | Tags para búsqueda (voseo, argentino, estudio, etc.) |
| `tool_restrictions` | TEXT | JSON con herramientas permitidas/prohibidas |
| `canon_ref` | TEXT | URL al canon de Fandom wiki (si aplica) |
| `version` | INTEGER | Para tracking de cambios |
| `updated_at` | TEXT |

**Source of truth:** El Cardinal. Los agentes sincronizan su SOUL.md local desde acá.

### 3.3 Skill Catalog (`skills_catalog`)

Catálogo de skills disponibles y qué perfil tiene cada una.

Dos tablas:

**`skills`** — catálogo maestro:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | TEXT PK | Nombre de la skill |
| `description` | TEXT | Para qué sirve |
| `category` | TEXT | autonomous-ai-agents, devops, mlops, etc. |
| `content_hash` | TEXT | SHA-256 del SKILL.md actual |
| `path` | TEXT | Ruta canonical en el ecosistema |
| `required_toolsets` | TEXT | JSON array: terminal, web, browser... |
| `updated_at` | TEXT |

**`profile_skills`** — qué skills tiene cada perfil:
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `profile_name` | TEXT PK → profiles(name) |
| `skill_name` | TEXT PK → skills(name) |
| `pinned` | INTEGER | 0/1 — si está fijada |
| `added_at` | TEXT |

### 3.4 Memory Mirror (`memory_mirror`)

Reflejo de la memoria Hermes (MEMORY.md + USER.md) de cada perfil.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `profile_name` | TEXT PK → profiles(name) |
| `target` | TEXT | `memory` (MEMORY.md) o `user` (USER.md) |
| `content` | TEXT | Contenido completo |
| `char_count` | INTEGER | Para tracking de budget |
| `content_hash` | TEXT | Para detectar cambios |
| `last_synced` | TEXT | Última sincronización |
| `sync_direction` | TEXT | `local_primary`, `cardinal_primary`, `bidirectional` |

**Estrategia de sincronización por defecto:** `local_primary` — el agente local escribe primero en su MEMORY.md, el Cardinal recibe el mirror en segundo plano. `cardinal_primary` para cuando el agente hace onboarding desde 0. `bidirectional` para conflictos resueltos por última escritura.

### 3.5 Session Index (`sessions_index`)

Índice liviano de las sesiones de cada agente — NO las messages completas, solo metadatos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | TEXT | Mismo session_id que Hermes state.db |
| `profile_name` | TEXT → profiles(name) |
| `title` | TEXT | Título de la sesión |
| `model` | TEXT | Modelo usado |
| `started_at` | REAL | Timestamp de inicio |
| `message_count` | INTEGER | Cantidad de mensajes |
| `input_tokens` | INTEGER | Tokens de input |
| `output_tokens` | INTEGER | Tokens de output |
| `estimated_cost` | REAL | Costo estimado USD |

**¿Por qué no guardar los messages completas acá?** Porque el Hermes state.db local ya las tiene con FTS5. Cardinal tendría un `messages_archive` opcional que comprime sesiones viejas — pero no reemplaza el store local. La sesión activa siempre vive localmente en el perfil Hermes.

### 3.6 Vault RAG Proxy

NO replica el vector store — Cardinal se convierte en un **proxy cache** para consultas RAG.

Dos modos:
1. **Modo caché (default):** Cardinal tiene su propia DB FTS5 con chunks del vault, indexada incrementalmente. Los agentes consultan al Cardinal y este responde con los chunks relevantes.
2. **Modo passthrough (durante Fase 1):** Cardinal recibe la query, la reenvía al `vault-query` local (donde sea que esté el vault), cachea el resultado.

El Cardinal NO tiene su propio vector store pesado durante Fase 1. Consume el `vault-query` CLI que ya existe. En Fase 2+ puede tener su propia DB vectorial si el vault se vuelve accesible via network (NFS, Syncthing, o el PSI).

### 3.7 Device Registry (`devices`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | TEXT PK | Identificador del dispositivo |
| `hostname` | TEXT | Nombre del host |
| `platform` | TEXT | linux, android, macos... |
| `arch` | TEXT | x86_64, aarch64... |
| `gpu` | TEXT | Descripción de GPU |
| `ram_gb` | INTEGER | RAM disponible |
| `last_seen` | TEXT | Última conexión |
| `ip` | TEXT | Dirección IP (última conocida) |
| `profiles` | TEXT | JSON array de perfiles en este device |

### 3.8 Context Cache (`context_cache`)

Para que el onboarding no tenga que rebuildear todo cada vez.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `profile_name` | TEXT → profiles(name) |
| `cache_key` | TEXT | `system_prompt`, `skills_prompt`, `soul_context` |
| `content` | TEXT | Bloque prefabricado |
| `content_hash` | TEXT | Para invalidación |
| `built_at` | TEXT | Cuándo se generó |

Un agente que se conecta puede pedir `cache_key = "system_prompt"` para su perfil y recibir el bloque de sistema prompt ya armado, sin que el agente local tenga que reconstruirlo desde cero.

---

## 4. Onboarding Flow

### 4.1 Flujo completo: Nuevo agente Hermes se conecta al Cardinal

```
┌─────────────────┐         ┌──────────────────────┐        ┌──────────────┐
│  AGENTE NUEVO   │         │      CARDINAL         │        │  DASHBOARD   │
│  (Hermes perfil)│         │  (Context Store)       │        │  (Humano)    │
└────────┬────────┘         └──────────┬───────────┘        └──────┬───────┘
         │                            │                           │
   1. WS hello(key)                   │                           │
    ─────────────────────────►        │                           │
         │                   2. Valida key + marca                 │
         │                      hello con device                  │
         │                   3. ¿Es primera vez que                │
         │                      este agente conecta?               │
         │                     ├── Sí → estado ONBOARDING          │
         │                     ├── No → salta a paso 5             │
         │                            │                           │
         │                   4. Crea perfil en registry            │
         │                      (si no existe)                    │
         │                   5. Busca config_template              │
         │                      para su perfil                    │
         │                            │                           │
         │   6. {type:"welcome", onboarding:true/false,           │
         │       config: {...}, soul: "...",                       │
         │       skills: [...], memory: {...}}                     │
         │    ◄─────────────────────────                          │
         │                            │                           │
   7. Aplica config recibida:         │                           │
   ├── Crea profile/config.yaml       │                           │
   ├── Escribe SOUL.md local          │                           │
   ├── Descarga skills faltantes      │                           │
   ├── Memory: pull o merge           │                           │
         │                            │                           │
   8. {type: "onboarding_done",       │                           │
       status: "idle"}                │                           │
    ─────────────────────────►        │                           │
         │                   9. Marca status=active               │
         │                      broadcast agent_update            │
         │                            │                           │
         │                           │   10. Websocket event      │
         │                           │    ◄────── agent_update ───│
         │                           │    "Nuevo agente online:   │
         │                           │     Lisbeth (laptop)"      │
```

### 4.2 ¿Qué recibe el agente en el `welcome`?

```json
{
  "type": "welcome",
  "agent": "lisbeth",
  "kind": "agent",
  "onboarding": true,
  "config": {
    "model": {
      "default": "deepseek-v4-flash",
      "provider": "opencode-zen"
    },
    "toolsets": ["terminal", "web", "browser", "file"],
    "agent": {
      "max_turns": 90,
      "disabled_toolsets": []
    }
  },
  "soul": "## Lisbeth 🔧 — Tooling & DevOps Agent\n\n...personalidad completa en markdown...",
  "skills": [
    {"name": "linux-disk-space-diagnosis", "category": "devops", "required_toolsets": ["terminal"]},
    {"name": "podman-app-deployment", "category": "devops", "required_toolsets": ["terminal", "file"]},
    {"name": "kvm-qemu-setup", "category": "devops", "required_toolsets": ["terminal"]}
  ],
  "memory": {
    "memory": "§\nEspecialista en tooling y DevOps...",
    "user": "§\nSanti es el usuario. Usar voseo argentino..."
  },
  "device_registry": {
    "profiles_on_device": ["kirito", "lisbeth"]
  }
}
```

### 4.3 ¿Esto reemplaza o complementa los profiles Hermes actuales?

**Complementa.** El perfil Hermes local sigue siendo la unidad de ejecución — el `config.yaml`, `state.db`, `memories/`, `skills/` locales siguen existiendo. El Cardinal es el **source of truth distribuido**:

1. **Primera conexión = onboarding completo.** El Cardinal dicta qué es este agente.
2. **Conexiones subsecuentes = sync.** El agente ya tiene su config, skills, soul — solo verifica diff.
3. **El Cardinal NO reemplaza al profile local.** Si Cardinal está caído, el agente funciona con su última config conocida.

---

## 5. Integración con Hermes Memory

### 5.1 Estrategia: Mirror + Sync, no Reemplazo

**Decisión de diseño: El Cardinal NO reemplaza la memory store de Hermes.**

```
┌─────────────────────────────────────────┐
│         ESTRATEGIA DE MEMORIA           │
│                                         │
│  Hermes local (per-profile)             │
│  ┌─────────────────────────────────┐    │
│  │ MEMORY.md  ← fuente primaria    │    │
│  │ USER.md    ← fuente primaria    │    │
│  │ Escribe aquí en cada sesión     │    │
│  └──────────────┬──────────────────┘    │
│                 │ sync en background     │
│                 ▼                       │
│  Cardinal (centralizado)                │
│  ┌─────────────────────────────────┐    │
│  │ memory_mirror ← mirror asíncrono │    │
│  │ Sirve a agentes que hacen       │    │
│  │ onboarding desde 0              │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Razones:**
1. **Performance:** La memory store de Hermes está diseñada para baja latencia (lectura directa de disco, frozen snapshot en system prompt). Meter una round-trip a Cardinal en cada sesión rompe el prompt caching.
2. **Resiliencia:** Si Cardinal está caído, el agente sigue funcionando exactamente como hoy.
3. **Simplicidad:** El memory tool de Hermes tiene ~1,200 líneas de lógica de concurrencia, drift detection y locking. Replicar eso en Cardinal sería complejidad innecesaria.

### 5.2 Mecanismo de sync

```
Cada N sesiones (configurable, default: 10):
1. Al final de una sesión, Hermes agent:
   a. Hace GET /api/context/memory/<profile>/<target>?hash=<current_hash>
   b. Cardinal responde:
      - 304 Not Modified → no hay cambios desde afuera
      - 200 con content → hay versión más nueva (e.g., desde otro device)
   c. Merge strategy:
      - Si el hash local matcha → no hacer nada
      - Si Cardinal tiene entries que local no → agregarlas (add)
      - Si local tiene entries que Cardinal no → upload (PUT)

2. Cardinal background sync worker (cada hora):
   a. Para perfiles con sync_direction=local_primary:
      - No inicia sync automático — espera al agente
   b. Para perfiles con sync_direction=cardinal_primary:
      - Cardinal es fuente de verdad (ej: un perfil recién creado)
```

### 5.3 ¿Qué pasa si Cardinal está caído?

**Nada.** El agente funciona exactamente como hoy:
- Lee MEMORY.md/USER.md local
- Arranca sesión normalmente
- Escribe memoria local
- Cuando Cardinal vuelve, el próximo sync sube los cambios

**Pérdida máxima:** Las entradas de memoria escritas mientras Cardinal estaba caído se pierden **solo** si el agente también pierde su disco local. El Cardinal no es un backup — es un mirror para onboarding de nuevos agentes.

---

## 6. Integración con Vault RAG

### 6.1 Arquitectura: Proxy con Caché

```
┌──────────────────┐         ┌──────────────────┐         ┌───────────────┐
│  AGENTE HERMES   │         │    CARDINAL       │         │   VAULT       │
│  (cualquier dev) │         │  (RAG Proxy)      │         │  (PC local)   │
└────────┬─────────┘         └────────┬─────────┘         └───────┬───────┘
         │                            │                          │
   POST /api/v1/rag                   │                          │
   {query: "ruteo del dinero",        │                          │
    top_k: 5}                         │                          │
         │                            │                          │
    ───────────────────────►          │                          │
         │                   1. Revisar cache local               │
         │                      si cache fresh → return          │
         │                   2. vault-query CLI →                 │
         │                      ─────────────────────────►       │
         │                          3. vault-index responde       │
         │                      ◄─────────────────────────       │
         │                   4. Cachear resultado + return       │
         │                            │                          │
         ◄───────────────────────    │                          │
   5. Agente recibe chunks           │                          │
      como si fuera local           │                          │
```

### 6.2 Modos de operación

| Modo | Cardinal | Requisito | Latencia |
|------|----------|-----------|----------|
| **Modo cache** (Fase 1) | Cachea respuestas de vault-query local | vault-query accesible desde Cardinal (mismo device) | ~200ms cache hit, ~2s miss |
| **Modo proxy** (Fase 1b) | Delega a vault-query en el PC | Cardinal en VPS, PC accesible via SSH/WS | ~500ms-2s |
| **Modo nativo** (Fase 2+) | Cardinal tiene su propio índice | Vault montado como volume en Cardinal | ~100ms |

### 6.3 Cache strategy

- TTL: 1 hora por default
- Invalidate cuando vault-query re-indexa (webhook desde cron de reindex)
- Cache key = hash(query + top_k)
- Límite: 1000 entries en cache LRU

### 6.4 Endpoints RAG

```
POST /api/v1/rag/search
Auth: Agent key (sk-cardinal-*)
Body: { query: string, top_k?: number, mode?: "hybrid"|"semantic"|"keyword" }
Response: { results: [{ path: string, score: number, content: string, source: "cache"|"vault" }], cached_at?: string }

GET /api/v1/rag/status
Auth: Agent key
Response: { indexed_chunks: number, last_indexed: string, cache_hits: number, cache_misses: number }
```

---

## 7. API de Context Store

### 7.1 Endpoints REST

```
# Profile Management
GET    /api/v1/context/profiles                          # Listar todos los profiles
GET    /api/v1/context/profiles/:name                     # Detalle de un profile
PUT    /api/v1/context/profiles/:name                     # Actualizar profile (onboarding)

# SOUL
GET    /api/v1/context/profiles/:name/soul                # Obtener SOUL.md
PUT    /api/v1/context/profiles/:name/soul                # Actualizar SOUL.md

# Skills
GET    /api/v1/context/skills                             # Catálogo completo
GET    /api/v1/context/profiles/:name/skills              # Skills del profile
POST   /api/v1/context/profiles/:name/skills/sync         # Sync skills desde Cardinal

# Memory Mirror
GET    /api/v1/context/profiles/:name/memory/:target      # Obtener mirror con hash
PUT    /api/v1/context/profiles/:name/memory/:target      # Subir mirror desde agente
POST   /api/v1/context/profiles/:name/memory/sync         # Forzar sync bidireccional
GET    /api/v1/context/profiles/:name/memory/diff          # Ver diferencias

# Context Cache
GET    /api/v1/context/profiles/:name/cache/:key          # Obtener bloque prefabricado
POST   /api/v1/context/profiles/:name/cache/rebuild       # Reconstruir cache de contexto

# Sessions Index
GET    /api/v1/context/profiles/:name/sessions            # Sesiones recientes
POST   /api/v1/context/profiles/:name/sessions/sync       # Sync desde state.db local

# Device Registry
POST   /api/v1/context/devices/heartbeat                  # Agent reporta su dispositivo
GET    /api/v1/context/devices                            # Todos los dispositivos conocidos
GET    /api/v1/context/devices/:id                        # Detalle de dispositivo

# Vault RAG Proxy
POST   /api/v1/rag/search                                 # Búsqueda semántica
GET    /api/v1/rag/status                                 # Estado del índice
POST   /api/v1/rag/invalidate                             # Invalidar caché (desde cron local)

# Agent Onboarding (protocol WS extendido)
# hello extendido → onboarding flow (ver sección 4)
```

### 7.2 Extensiones al Protocolo WS

Mensajes nuevos (además de los existentes hello/pong/bye/subscribe):

```typescript
// Agente → Cardinal
{ type: "context_pull", resource: "soul" | "skills" | "config" | "memory" }
  // → Cardinal responde con el recurso solicitado

{ type: "context_push", resource: "memory", target: "memory" | "user", content: string, hash: string }
  // → Cardinal recibe mirror, actualiza si hash es más nuevo

{ type: "onboarding_done", status: "idle" | "busy" }
  // → Cardinal marca onboarding_complete y broadcast

// Cardinal → Agente
{ type: "context_update", resource: "soul" | "skills" | "config", reason: "cardinal_updated" }
  // → El SOUL.md cambió desde el dashboard, el agente debe re-sync

{ type: "memory_invalidate", target: "memory" | "user" | "all", from_agent: string }
  // → Otro device escribió memoria, este agente debería considerar re-sync
```

---

## 8. Roadmap Post-Fase 0 Re-definido

### Fase 0 (COMPLETADA ✅)
**Esqueleto Vivo** — Cardinal corre, acepta conexiones WS, tiene dashboard.

**Entregables:**
- WS Hub (hello/pong/bye/subscribe) + ping watchdog
- API keys (sk-cardinal-*) + keygen CLI
- Login humano (JWT) + Dashboard SAO + Agent Hub
- Deploy containerizado (Podman Quadlet)
- Tests E2E

---

### Fase 1 — 🧠 Context Store + Onboarding (CRÍTICO — PRIORIDAD #1)

**Objetivo:** Cardinal se convierte en el Context Store central. Los agentes hacen onboarding desde el Cardinal.

**Qué se construye:**

| Componente | Detalle | Prioridad |
|------------|---------|-----------|
| Profile Registry | Tabla `profiles`, API CRUD, integración con WS hello | P0 |
| SOUL Registry | Tabla `souls`, sync ida-vuelta SOUL.md | P0 |
| Skill Catalog | Tabla `skills` + `profile_skills`, catálogo central | P0 |
| Onboarding Flow | WS extendido con `onboarding:true/false` en welcome | P0 |
| Memory Mirror | Tabla `memory_mirror`, PUT/GET con hash, sync lazy | P1 |
| Device Registry | Tabla `devices`, heartbeat desde agentes | P1 |
| Context Cache | Tabla `context_cache`, rebuild endpoint | P1 |
| Vault RAG Cache | Endpoint `POST /api/v1/rag/search`, caché LRU | P1 |
| Session Index | Tabla `sessions_index`, sync desde state.db | P2 |
| Dashboard: Profile Manager | UI para ver/editar profiles, SOUL, skills | P2 |

**Migración de la DB Cardinal:** Agregar nuevas tablas vía migración SQL (`PRAGMA user_version`).

**Riesgo:** Coordinación entre agentes Hermes y Cardinal para el sync de memoria. Mitigación: empezar con `local_primary` (el agente es fuente de verdad, Cardinal es mirror).

**Dependencia externa:** Comunicación con `vault-query` CLI (debe estar accesible desde Cardinal).

**Tests:**
- Unit: cada nuevo repositorio (profiles, souls, skills)
- Integration: onboarding flow completo (agent fake → hello → welcome con contexto → onboarding_done)
- Integration: memory sync bidireccional
- E2E: dashboard muestra agentes onbordeados con su perfil

---

### Fase 2 — 🚀 Router + One-Shot Agents (PRIORIDAD #2)

**Objetivo:** Cardinal puede spawnear one-shot agents y rutea modelos.

**Qué se construye:**

| Componente | Detalle | Prioridad |
|------------|---------|-----------|
| Model Router | Endpoint `/v1/chat/completions` con sk-cardinal-* | P0 |
| Key Factory | Budgets por key, failsafes, rate limiting | P0 |
| One-Shot Agent Orchestration | Spawning contenedores Podman/Docker ephemerales | P0 |
| Key Factory (dynamic) | System keys para one-shot, auto-revoke al terminar | P1 |
| Consumption Tracking | Tokens, costos por agente/key | P1 |
| Dashboard: Consumption | UI de costos, budgets, keys management | P2 |

**Conexión con Context Store:**
- El one-shot agent recibe su contexto del Cardinal (skills permitidas, modelo, instrucciones)
- Usa el Context Cache para armar el system prompt rápido
- Al terminar, escribe resultados al vault o al session index

---

### Fase 3 — 🔗 Knowledge Graph (PRIORIDAD #3)

**Objetivo:** Grafos de conocimiento del ecosistema (vault, skills, agentes, relaciones).

**Qué se construye:**

| Componente | Detalle | Prioridad |
|------------|---------|-----------|
| Entity Extraction | Extraer entidades del vault + conversaciones | P0 |
| Graph DB | Tablas nodos/edges en SQLite o litestream | P0 |
| Graph API | Endpoints REST para consultar el grafo | P1 |
| Graph Visualization | Dashboard con grafo navegable tipo Obsidian | P2 |
| Relationship Inference | Inferir relaciones entre proyectos, skills, agentes | P2 |

**Dependencias:** Fase 1 (sesiones indexadas) y vault RAG corriendo.

---

### Fase 4+ — 🤖 Automations + Multi-Device

**Objetivo:** El Cardinal orquesta automatizaciones y coordina agents multi-device.

| Componente | Prioridad |
|------------|-----------|
| Cron Engine centralizado (reemplazar cron nativo Hermes limitadamente) | P1 |
| Webhook subscriptions (eventos → agentes) | P1 |
| Agent-to-agent messaging via Cardinal relay | P2 |
| Cross-device memory merge (resolver conflictos) | P2 |
| Dashboard: Automation Builder | P3 |

---

## 9. Priorización y Secuencia Recomendada

### ¿Qué hacer primero?

```
Fase 1 paso a paso (orden recomendado):

Semana 1-2:
┌─────────────────────────────────────────────────────┐
│ 1. Profile Registry + SOUL Registry                  │
│    - Migración DB: CREATE TABLE profiles, souls       │
│    - API: GET/PUT /api/v1/context/profiles/:name      │
│    - Integrar con WS hello: welcome extendido         │
├─────────────────────────────────────────────────────┤
│ 2. Onboarding Flow                                   │
│    - Detectar primera conexión o reset                │
│    - Welcome payload incluye config + soul + skills   │
│    - Agent recibe, aplica, responde onboarding_done   │
└─────────────────────────────────────────────────────┘

Semana 3-4:
┌─────────────────────────────────────────────────────┐
│ 3. Skill Catalog                                     │
│    - skills + profile_skills tables                  │
│    - Sync skills entre Cardinal y perfiles locales    │
│    - Dashboard muestra skills de cada agente          │
├─────────────────────────────────────────────────────┤
│ 4. Memory Mirror (básico)                            │
│    - memory_mirror table + PUT/GET endpoints          │
│    - Sync manual (no background todavía)              │
│    - Dashboard puede ver memoria de cualquier agente  │
└─────────────────────────────────────────────────────┘

Semana 5-6:
┌─────────────────────────────────────────────────────┐
│ 5. Device Registry + Context Cache                   │
│    - Tabla devices + heartbeat endpoint               │
│    - context_cache para onboarding rápido             │
├─────────────────────────────────────────────────────┤
│ 6. Vault RAG Proxy (cache)                           │
│    - POST /api/v1/rag/search                         │
│    - Caché LRU de resultados                          │
│    - Integrar con vault-query CLI                     │
└─────────────────────────────────────────────────────┘
```

### Dependencias entre fases

```
Fase 0 ──► Fase 1 ──► Fase 2 ──► Fase 3 ──► Fase 4+
               │            │            │
               ▼            ▼            ▼
         CRÍTICO:      depende de:   depende de:
         Sin Fase 1,   Fase 1       Fase 1+2
         el resto        (keys       (sesiones
         no tiene       existentes   indexadas +
         sentido        son identity vault RAG)
         porque los     + context    + agentes
         agentes no     para one-    registrados)
         tienen         shot agents)
         identidad
```

### ¿Qué se puede hacer YA con Fase 0?

Con el Cardinal Fase 0 corriendo hoy (v0.0.1):

1. ✅ Ver qué agentes están online en el dashboard
2. ✅ Crear API keys para nuevos agentes
3. ✅ Agentes conectarse via WS y reportar estado
4. ✅ Subagentes locales (device="localhost" → kind="subagent") aparecen en sección colapsable
5. ✅ Historial de eventos conectado/desconectado
6. ❌ NO hay onboarding (los agentes no reciben contexto)
7. ❌ NO hay memoria compartida

---

## 10. Arquitectura Técnica Sugerida

### 10.1 Stack para Fase 1+

**Recomendación:** Mantener Bun + TypeScript (el stack actual). NO migrar a Python/FastAPI.

**Razones:**
1. Fase 0 ya está escrita y testeada en Bun — rewritear a Python es overhead innecesario
2. Bun tiene `bun:sqlite` nativo que es más rápido que Python + sqlite3 para nuestro volumen
3. Bun type safety + tests existentes
4. El WS hub ya funciona con Bun — rewritear WebSockets en FastAPI es riesgo de bugs

| Componente | Stack |
|------------|-------|
| API REST | Bun (Bun.serve, routing existente) |
| WebSocket | Bun (hub.ts existente, extender) |
| DB | bun:sqlite con WAL |
| Migraciones | PRAGMA user_version (patrón existente) |
| Auth agentes | sk-cardinal-* (existente) |
| Auth human | JWT (existente) |
| Cache | Map LRU en memoria (suficiente para Fase 1) |
| Tests | Bun test (existente) |

### 10.2 Posible puerta a futuro

Si el volumen de datos crece (100k+ sesiones, vault index pesado), considerar:
- Migrar DB a SQLite con Litestream para backup en caliente
- O directamente a Postgres si se necesita concurrencia real
- Pero **no anticipar**—empezar con bun:sqlite como en Fase 0

### 10.3 DB Migration Plan (Fase 1)

```sql
-- Migration 2: Context Store
BEGIN;

-- Profile Registry
CREATE TABLE IF NOT EXISTS profiles (
  name            TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT '🤖',
  kind            TEXT NOT NULL DEFAULT 'permanent' CHECK (kind IN ('permanent','one-shot')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dormant','liberated','onboarding')),
  model_default   TEXT,
  provider_default TEXT,
  device          TEXT,
  last_onboarded  TEXT,
  onboarding_key_hash TEXT REFERENCES agent_keys(key_hash),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SOUL Registry
CREATE TABLE IF NOT EXISTS souls (
  profile_name      TEXT PRIMARY KEY REFERENCES profiles(name),
  soul_md           TEXT NOT NULL,
  personality_tags  TEXT,
  tool_restrictions TEXT,
  canon_ref         TEXT,
  version           INTEGER NOT NULL DEFAULT 1,
  content_hash      TEXT NOT NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Skill Catalog
CREATE TABLE IF NOT EXISTS skills (
  name              TEXT PRIMARY KEY,
  description       TEXT NOT NULL DEFAULT '',
  category          TEXT,
  content_hash      TEXT NOT NULL,
  path              TEXT,
  required_toolsets TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Profile-Skills mapping
CREATE TABLE IF NOT EXISTS profile_skills (
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  skill_name    TEXT NOT NULL REFERENCES skills(name),
  pinned        INTEGER NOT NULL DEFAULT 0,
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_name, skill_name)
);

-- Memory Mirror
CREATE TABLE IF NOT EXISTS memory_mirror (
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  target        TEXT NOT NULL CHECK (target IN ('memory','user')),
  content       TEXT NOT NULL,
  char_count    INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT NOT NULL,
  sync_direction TEXT NOT NULL DEFAULT 'local_primary' CHECK (sync_direction IN ('local_primary','cardinal_primary','bidirectional')),
  last_synced   TEXT,
  PRIMARY KEY (profile_name, target)
);

-- Device Registry
CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  hostname      TEXT,
  platform      TEXT,
  arch          TEXT,
  gpu           TEXT,
  ram_gb        INTEGER,
  ip            TEXT,
  last_seen     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Device-Profile mapping
CREATE TABLE IF NOT EXISTS device_profiles (
  device_id     TEXT NOT NULL REFERENCES devices(id),
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  PRIMARY KEY (device_id, profile_name)
);

-- Session Index
CREATE TABLE IF NOT EXISTS sessions_index (
  id              TEXT PRIMARY KEY,
  profile_name    TEXT NOT NULL REFERENCES profiles(name),
  title           TEXT,
  model           TEXT,
  started_at      REAL NOT NULL,
  message_count   INTEGER DEFAULT 0,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  estimated_cost  REAL
);
CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions_index(profile_name, started_at DESC);

-- Context Cache
CREATE TABLE IF NOT EXISTS context_cache (
  profile_name  TEXT NOT NULL REFERENCES profiles(name),
  cache_key     TEXT NOT NULL CHECK (cache_key IN ('system_prompt','skills_prompt','soul_context','config_context')),
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  built_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_name, cache_key)
);

-- Vault RAG Cache
CREATE TABLE IF NOT EXISTS rag_cache (
  query_hash   TEXT PRIMARY KEY,
  query        TEXT NOT NULL,
  top_k        INTEGER NOT NULL DEFAULT 5,
  mode         TEXT NOT NULL DEFAULT 'hybrid',
  results      TEXT NOT NULL,
  cached_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL
);

-- Migration bookkeeping
PRAGMA user_version = 2;

COMMIT;
```

### 10.4 Estrategia de Module Splitting

Manteniendo la estructura existente de `backend/src/`:

```
backend/src/
├── index.ts              # bootstrap (sin cambios)
├── config.ts             # + nuevas env vars (DB_PATH sigue igual)
├── db/
│   ├── index.ts          # createDb + migrate (nueva migración v2)
│   ├── repos.ts          # repos existentes + nuevos:
│   │                     # profiles/, souls/, skills/, memory/, devices/, sessions/, cache/
│   └── db.test.ts
├── auth/                 # sin cambios (login JWT sigue igual)
├── keys/                 # sin cambios (keygen sigue igual)
├── ws/
│   ├── protocol.ts       # + nuevos schemas (context_pull, context_push, onboarding_done)
│   ├── hub.ts            # + onboarding flow en hello, + eventos context_update
│   └── hub.test.ts
├── api/
│   ├── health.ts         # sin cambios
│   ├── agents.ts         # sin cambios
│   └── api.test.ts
├── context/              # ★ NUEVO módulo de Context Store
│   ├── index.ts          # router /api/v1/context/*
│   ├── profiles.ts       # CRUD profiles + SOUL
│   ├── skills.ts         # Catálogo + sync
│   ├── memory.ts         # Memory mirror endpoints
│   ├── devices.ts        # Device registry
│   ├── sessions.ts       # Session index
│   ├── cache.ts          # Context cache builder
│   └── context.test.ts
├── rag/                  # ★ NUEVO módulo Vault RAG
│   ├── index.ts          # router /api/v1/rag/*
│   ├── cache.ts          # LRU cache de resultados
│   ├── vault_client.ts   # Cliente para vault-query CLI
│   └── rag.test.ts
├── server.ts             # + rutas nuevas /api/v1/context/* y /api/v1/rag/*
├── server.test.ts        # + nuevos tests E2E
```

---

## 11. Integración del lado del Agente Hermes

Para que un agente Hermes consuma el Context Store de Cardinal, necesita un **skill o plugin** que implemente el protocolo. Esto NO modifica el core de Hermes.

### Cardinal Client Skill (~/.hermes/skills/autonomous-ai-agents/cardinal-client/)

```
cardinal-client/
├── SKILL.md                    # Documentación
├── scripts/
│   ├── cardinal-onboard.sh     # Onboarding: conecta al Cardinal, aplica config
│   └── cardinal-sync.sh        # Sync memoria + sesiones
└── references/
    └── protocol.md             # Documentación del protocolo WS extendido
```

**Lo que haría la skill:**

1. Al inicio de sesión, verificar conexión al Cardinal
2. Si es necesario onboarding → ejecutar flujo (recibir config, soul, skills)
3. En background: sync de memoria (MEMORY.md → Cardinal)
4. Ofrecer tool `cardinal_context_pull` y `cardinal_context_push` para acceso explícito

**Script de onboarding (`cardinal-onboard.sh`):**

```bash
#!/bin/bash
# CARDINAL_URL y CARDINAL_AGENT_KEY desde .env del perfil
CARDINAL_URL="${CARDINAL_URL:-http://localhost:8787}"
KEY="${CARDINAL_AGENT_KEY}"

# 1. Conectar WS y hacer hello
# 2. Recibir welcome con onboarding context
# 3. Aplicar:
#    - Escribir config.yaml (merge con existente si lo hay)
#    - Escribir SOUL.md
#    - Sincronizar skills (instalar las que falten)
#    - Pull de memory si es primera vez
# 4. Enviar onboarding_done
```

---

## 12. Decisiones de Diseño — Resumen

| # | Decisión | Por qué |
|---|----------|---------|
| 1 | **Cardinal NO reemplaza Hermes memory store** | Resilience, latency, prompt caching. El mirror es asíncrono |
| 2 | **Cardinal NO tiene su propio vector store en Fase 1** | vault-query ya existe y funciona. Cache + proxy es suficiente |
| 3 | **Perfiles locales siguen siendo la unidad de ejecución** | Cardinal es source of truth distribuido, no dictador |
| 4 | **Bun + TypeScript se mantiene en Fase 1+** | No rewritear a Python; el stack actual funciona y está testeado |
| 5 | **Onboarding es un flujo WS, no REST** | El agente ya tiene WS abierto para heartbeats; extender el protocolo existente |
| 6 | **Memory sync es lazy y asíncrono** | No bloquear inicio de sesión por sync de memoria |
| 7 | **Skills viven en Cardinal como catálogo, no como mirror** | Skills son archivos grandes; Cardinal solo guarda metadatos + hash. El agente descarga el SKILL.md real de su filesystem local o del repo |
| 8 | **Device registry es push desde el agente** | El agente sabe su device al hacer hello; Cardinal no escanea |
| 9 | **Context Cache se reconstruye bajo demanda** | No mantener stale cache; rebuild cuando el agente pide |
| 10 | **One-shot agents reciben contexto inline, no vía onboarding** | Son efímeros, no necesitan perfil persistente |

---

## 13. Métricas de Éxito

¿Cómo saber si esta visión funciona?

- ✅ Un agente nuevo (e.g., Kirito en laptop) se conecta al Cardinal y recibe su configuración completa sin intervención humana
- ✅ El dashboard muestra no solo conectividad, sino también perfil, skills, SOUL de cada agente
- ✅ La memoria de Asuna (escrita en PC) es visible para Shinon cuando pregunta "¿qué sabe Asuna?"
- ✅ vault-query funciona desde cualquier agente conectado al Cardinal (no solo desde el PC local)
- ✅ Si Cardinal está caído, todos los agentes siguen funcionando sin degradación
- ✅ El session index permite ver historial de actividad de cualquier agente desde el dashboard

---

## Apéndice A: Tabla de Tablas (Resumen DB Cardinal Post-Fase 1)

| Tabla | Propósito | Fase |
|-------|-----------|------|
| `agents` | Agent registry + estado online | Fase 0 ✅ |
| `agent_keys` | API keys con hash | Fase 0 ✅ |
| `agent_events` | Historial connect/disconnect/status | Fase 0 ✅ |
| `profiles` | Perfiles Hermes del ecosistema | Fase 1 🆕 |
| `souls` | SOUL.md centralizado | Fase 1 🆕 |
| `skills` | Catálogo maestro de skills | Fase 1 🆕 |
| `profile_skills` | Skills por perfil | Fase 1 🆕 |
| `memory_mirror` | Mirror de MEMORY.md / USER.md | Fase 1 🆕 |
| `devices` | Dispositivos físicos conocidos | Fase 1 🆕 |
| `device_profiles` | Qué perfiles en qué device | Fase 1 🆕 |
| `sessions_index` | Metadatos de sesiones | Fase 1 🆕 |
| `context_cache` | Bloques prefabricados de contexto | Fase 1 🆕 |
| `rag_cache` | Cache de resultados vault-query | Fase 1 🆕 |

## Apéndice B: Glosario

| Término | Significado |
|---------|-------------|
| **Profile** | Perfil nativo de Hermes (`~/.hermes/profiles/<name>/`) con su config, memoria, skills |
| **Skin** | Identidad cosmética SAO (Shinon, Asuna). Un profile puede tener una skin |
| **Onboarding** | Proceso por el cual un agente Hermes nuevo recibe su identidad, configuración y skills desde el Cardinal |
| **Context Store** | El conjunto de tablas + API que hacen del Cardinal el source of truth del ecosistema |
| **Memory Mirror** | Copia de MEMORY.md/USER.md en Cardinal, sincronizada asíncronamente |
| **RAG Proxy** | Cardinal recibe queries de búsqueda semántica, las delega a vault-query y cachea |
| **Context Cache** | Bloques de system prompt prefabricados para acelerar onboarding |
| **One-shot Agent** | Agente efímero sin perfil persistente, creado para una tarea específica |
