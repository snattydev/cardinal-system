# Cardinal v2 — Arquitectura (MCP Hub + Blackboard + Key Pool)

> Fecha: 2026-08-12
> Estado: Diseño vivo (captura decisiones de brainstorm 2026-08-12). Los puntos abiertos se validan con spikes antes de implementar.
> Relación con roadmap: re-scopea Fase 2 (ver sección final).

---

## 1. Contexto y por qué v2

El ecosistema cambió desde que se diseñó Fase 2 (julio 2026). Lo que antes el Cardinal tenía que resolver solo —orquestar agentes one-shot en contenedores— hoy lo hacen herramientas que ya existen y que conviene usar en vez de reinventar:

- **herdr.dev** — multiplexer local que reconoce 16 kinds de agentes (opencode, claude, codex, cursor, gemini, grok, hermes, etc.), maneja panes/tabs y lifecycle (idle/working/blocked/done). Integra por hooks `*-agent-state` en el config dir de cada agente.
- **MCP** — estándar maduro agente↔herramienta (Linux Foundation). Lo habla todo: Hermes (cliente nativo), Claude, Cursor, Codex.
- **A2A (Google)** — estándar emergente agente↔agente (Agent Cards, delegación). Complementa a MCP, no compite.

La conclusión: **orquestación es commodity**. Lo que sigue siendo exclusivo del Cardinal es el cerebro global: identidad, contexto, y la coordinación cross-provider.

**Tesis:** Cardinal = cerebro/memoria/identidad. herdr/Hermes/CLIs = manos.

---

## 2. Los cuatro pilares

| # | Pilar | Qué es | Estado |
|---|-------|--------|--------|
| 1 | MCP context hub multi-vault | Server MCP que sirve contexto desde varias vaults de Obsidian indexadas | Diseño (spike-002) |
| 2 | Key pool + router interno | Pool de API keys del proveedor; Cardinal acuña `sk-cardinal-*` derivadas con scopes/budgets y rutea `/v1/chat/completions` al upstream correcto con fallback automático | Diseño (spike-003) |
| 3 | Blackboard + mailbox | Coordinación agente↔agente cross-provider por tablero de tareas compartido | Diseño (spike-001) |
| 4 | Identidad | `sk-cardinal-*`, "la key ES la identidad", cross-device | ✅ Ya existe (Fase 0) |

---

## 3. División de responsabilidades: herdr ↔ Cardinal

No se pisan. Son capas complementarias.

| Capa | herdr | Cardinal |
|------|-------|----------|
| Alcance | Local (una máquina) | Global (cross-device) |
| Qué maneja | Panes, tabs, lifecycle local, TUI del humano, levantar/leer agentes | Identidad, contexto multi-vault, blackboard, pool/router |
| Estado | Efímero (proceso local) | Persistente (DB) |
| Quién ve | Humano en la TUI | Agentes + dashboard |

### Integración (no reimplementar)

1. **Roster bridge (pasivo, barato):** Cardinal lee `herdr agent list` (JSON) y el dashboard muestra la verdad — qué está corriendo de verdad con su lifecycle. Cero cambios en los agentes.
2. **Blackboard vía MCP:** los agentes MCP-capables consumen las tools del Cardinal. Sin cliente custom.
3. **Plugin `cardinal-agent-state` por agente** (copiando el patrón de hooks de herdr): solo si hace falta, para agentes sin MCP o status más rico. No es el camino inicial.

**Regla dura:** Cardinal NUNCA le dice a herdr "levantá un agente". Spawnear es orquestación y rompe el agent-less core. El trigger para levantar un agente vive afuera (humano, hook de herdr, cron). El agente, al arrancar, PULLEA su próxima tarea del board.

---

## 4. Blackboard (coordinación agente↔agente)

Modelo tipo Linear / equipo real: tasks con status, assignee, árbol padre/hijo, comments acotados, refs a artifacts. El "objetivo en común" es un árbol de tasks; los agentes agarran hojas, dejan el resultado, otro retoma.

### Data model (diseño, validar con spike)

```
tasks
├── id            (uuid)
├── goal          (texto corto)
├── status        open | claimed | done | blocked
├── assigned_to   (agent name, nullable)
├── created_by    (agent name)
├── parent_id     (nullable — árbol del objetivo)
├── context_refs  (JSON — refs a vault notes / sessions / memories)
├── artifact_ref  (puntero al resultado, NO el contenido)
├── summary       (resumen acotado, token budget)
└── created_at / updated_at

messages  (mailbox para handoffs puntuales)
├── id, from_agent, to_agent, type, payload_ref, read, created_at
```

### Lifecycle

```
open → claimed (un agente la agarra)
     → blocked (necesita input/desbloqueo)
     → done   (con artifact_ref + summary)
```

Cada task `done` es un nodo del grafo en Fase 3.

### Reglas anti-inflación (GOLDEN — nacen del incidente Hermes-chat)

1. **Out-of-band:** el tráfico agente↔agente NUNCA va por el canal del humano. Son filas de DB (tasks/messages), no mensajes de conversación.
2. **Pull, no push:** nada se vuelca al contexto de nadie automáticamente. Un agente consulta el board (`task_list`, `task_get`) cuando LO necesita, con token budget.
3. **Memoria aislada:** el tráfico agente↔agente NUNCA toca el memory mirror ni el perfil de user. Memoria solo se escribe por acción explícita (humano, o agente llamando `memory_set` con resumen acotado). Cero auto-ingest.
4. **Resultados como refs:** el board guarda `artifact_ref` + `summary` acotado, no la prosa completa. El transcript completo del trabajo vive en la sesión del propio agente.
5. **Efímero por default:** estado en DB, nunca en el proceso.

> Por qué se rompió antes: se mandó tráfico agente↔agente por el chat de Hermes, que lo trata como conversación del humano → infla transcript Y dispara escrituras de memoria al perfil. El bug fue el canal, no el hablar.

---

## 5. MCP surface (tools del Cardinal)

```
Contexto      search_vaults(query, vault?) · list_vaults · get_note(path)
Memoria       memory_get(target) · memory_set(target, summary)   # set = explícito, nunca auto
Sesiones      session_search(query)
Board         task_create · task_list · task_claim · task_complete · task_comment
Mailbox       agent_send · agent_inbox
Roster        who_is_online
```

Multi-vault: hoy hay un índice (the portal). El objetivo es N vaults indexadas, cada chunk etiquetado con su vault de origen, consultable todas juntas o filtradas por vault.

---

## 6. Key pool + router interno (arquitectura cerrada 2026-08-20)

Router provider-agnostic, inspirado en FreeLLMAPI pero con identidad de cliente. La key derivada (`sk-cardinal-*`) ES la identidad: define scopes (qué modelos puede pedir), budget y metering por agente.

### Modelo de datos (todo en DB, nada hardcodeado)

```
providers                      — lo que Santi agrega/quita sin tocar código
├── id, name, base_url, api_key (AES-256-GCM, nunca sale del Cardinal)
├── wire_format: openai | anthropic | gemini
├── status: active | disabled
├── rate_limits opcionales (rpm, tpm)
└── cost_per_mtok (metering)

provider_models                — modelos físicos por provider
├── provider_id, model_id (ej "deepseek-v4-flash-free")
├── capabilities (tools/vision/streaming), context_window

model_routes                   — los alias lógicos (lo único que ve el consumidor)
├── alias (ej "pro", "fast") O nombre de modelo real ("deepseek-v4-flash")
└── fallback_chain JSON ordenado: [{provider, model_id}, ...]

agent_keys (extendido)         — identidad del cliente
├── scopes JSON (lista de alias/modelos permitidos; "*" = autorouter libre)
├── budget_limit (tokens), budget_used (acumulado)
└── created_by=system → auto-revocable (one-shot); created_by=human → jamás se toca
```

### Resolución (autorouter + alias)

- `model="deepseek-v4-flash"` (nombre real) → AUTOROUTER: el router arma el pool de
  providers que sirven ese modelo, usa el primero sano, y si falla salta al siguiente.
- `model="pro"` (alias lógico) → CADENA FIJA definida por Santi en model_routes.
- La key decide quién puede pedir qué: scope ["fast"] = solo ese alias;
  scope ["*"] = autorouter libre; scope ["deepseek-v4-pro"] = solo ese modelo.

### Flujo POST /v1/chat/completions (Bearer sk-cardinal-*)

1. Auth: hash SHA-256 de la key → validar + scope (¿puede pedir este modelo?) + budget (¿le queda?)
2. Resolver modelo → fallback_chain
3. Por cada eslabón: health check + cooldown (429/5xx) → decrypt api_key → llamar upstream
4. Éxito: streamear SSE o completion normal (no romper el stream al rutear)
5. Metering: registrar tokens por key derivada + por provider (dashboard de consumo)
6. Si todo falla: error con attempt trail

### Failover transparente (la clave del diseño)

"Si pido deepseek-v4-flash y hay 4 providers free, uso 1, se corta, el router pasa
al otro SIN interrumpir al usuario final." El cliente nunca ve el failover — solo ve
el modelo que pidió. Igual que FreeLLMAPI unified models, con identidad de cliente
sumada: la key sabe quién es, qué puede pedir y cuánto consumió.

### Upstreams (estado real 2026-08-20)

| Upstream | Qué es | Estado |
|----------|--------|--------|
| opencode-zen | Tier free vía opencode CLI (`opencode/*-free`) | ✅ Funciona (validado: deepseek-v4-flash-free responde) |
| opencode-llm-proxy | Plugin KochC en :4010 — adapta opencode a OpenAI wire | ✅ Validado que el concepto existe; usar como adapter |
| opencode-go | Suscripción GO | ❌ CAÍDO (suscripción vencida 2026-08) — no usar como upstream primario |
| deepseek-direct | API directa DeepSeek | ⏸️ Cuando Santi tenga key |
| futuros | OpenRouter, Groq, etc. | — (provider agnóstico: se agregan como filas) |

Nota spike-003 (2026-08-20): `opencode serve` NO expone `/v1/chat/completions`
(devuelve SPA para rutas desconocidas; su API nativa es session/prompt/event). Para
usar opencode como upstream OpenAI-compatible, va `opencode-llm-proxy` (plugin que
levanta :4010 con wire OpenAI/Anthropic/Gemini, streaming + tool calling).

### Security boundary (la joya del pool)

"Prestar" keys a agentes one-shot o públicos (chatbot del portfolio) NO presta las
keys reales: acuña derivadas con scope y budget. El agente público JAMÁS ve la key
del proveedor. Si se pasa del budget, el Cardinal corta solo. **La key real nunca
sale del Cardinal.**

---

## 7. Decisiones abiertas / spikes

| Spike | Valida (Given/When/Then) | Riesgo |
|-------|---------------------------|--------|
| 001 blackboard-no-inflación | Dado el board, cuando A postea y B retoma, entonces ninguno infla contexto ni escribe memoria | Alto (mata la idea si falla) |
| 002 mcp-multivault | Dado el RAG proxy + server MCP fino, cuando un agente llama search_vaults, entonces recibe chunks con origen de vault y token budget | Medio |
| 003 pool-opencode-go | Dado opencode serve (GO), cuando el router manda un completion, entonces devuelve tokens reales y el metering anda | Medio |

Orden: 001 primero.

---

## 8. Relación con el roadmap (re-scope Fase 2)

| Item Fase 2 original | Destino |
|----------------------|---------|
| 2.1 LLM Router (`/v1/chat/completions`) | ✅ Se mantiene — corazón del pilar 2 |
| 2.2 API Key Factory (scopes + budgets) | ✅ Se mantiene — pilar 2 |
| 2.3 One-Shot Agents (Podman API) | ❌ Reemplazado por blackboard + herdr/MCP (no reimplementar orquestación) |
| 2.4 PR Review Pipeline (webhook GitHub) | ⏸️ Posponer — se resuelve por blackboard + trigger externo cuando duela |
| 2.5 @mention trigger | ⏸️ Posponer — igual |

El desbloqueo por polling local de la API de GitHub (decisión 2026-08-10) sigue válido como alternativa si algún trigger externo lo necesita, pero deja de ser el cuello de botella de Fase 2: el cuello ahora es validar los pilares con spikes.

---

*Documento vivo. Se actualiza cuando los spikes emiten veredicto o cambian prioridades.*
