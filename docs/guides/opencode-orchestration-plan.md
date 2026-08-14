# OpenCode Multi-Agent Orchestration Plan

> **Objetivo:** Configurar Cardinal System para que al abrir `opencode` (o `cursor`) en el repo, todo el workflow multi-agente esté listo. OpenCode es la interfaz de entrada principal; Cursor con Grok 4.5 + Composer para orquestación visual cuando haga falta.

---

## 📚 Cómo funciona el summoning de agentes en OpenCode

OpenCode tiene un sistema de agentes con tres mecanismos de configuración:

### 1. Config en `opencode.json` (global del proyecto)

Definición centralizada de agentes con modelo, temperatura, permisos y tools:

```jsonc
{
  "agent": {
    "build": {
      "model": "openrouter/anthropic/claude-sonnet-4",
      "temperature": 0.3,
      "permission": {
        "write": { "**/*.ts": "allow", "**/*.tsx": "allow" }
      }
    },
    "plan": {
      "model": "openrouter/openai/gpt-5.2-codex",
      "temperature": 0.1,
      "tools": { "write": false, "edit": false, "patch": false }
    }
  }
}
```

### 2. Markdown agents en `.opencode/agent/`

Archivos .md con frontmatter YAML + body = system prompt. Soportan `mode: subagent`:

```markdown
---
name: code-reviewer
mode: subagent
description: Reviews code for quality and best practices
model: claude-sonnet-4-20250514
permissions:
  read: true
  write: false
  execute: false
  network: false
---

Review code with focus on:
- Function length (under 50 lines ideal)
- File size (under 800 lines)
- Naming clarity
...
```

### 3. `AGENTS.md` — Instrucciones raíz

OpenCode lo carga automáticamente al iniciar. Cursor también lo lee como Cursor Rules.
Soporta merge jerárquico: el AGENTS.md más cercano al archivo gana.

### Mecanismos de invocación

| Método | Cómo | Ejemplo |
|--------|------|---------|
| `@mention` directo | En el chat de OpenCode | `@reviewer check this PR` |
| Automático por primary agent | Según descripción del subagent | El orchestrator decide delegar |
| CLI flag | `opencode --agent <name>` | `opencode --agent planner` |
| Custom commands | `.opencode/command/*.md` | `/feature "add auth"` |
| Swarm plugin | `opencode-swarm-plugin` | `/swarm "implement login"` |

### Permisos granulares (principle of least privilege)

Cada agente puede tener permisos específicos por glob pattern:

```yaml
permission:
  bash:
    "git push": "allow"
    "sudo *": "deny"
    "pnpm test*": "allow"
  write:
    "**/*.test.ts": "allow"
    "*": "deny"
```

Estados: `allow` (automático), `ask` (pide aprobación), `deny` (bloqueado).

### Swarm Orchestration (joelhooks/swarm-tools)

Plugin que agrega orquestación multi-agente con aprendizaje:

- **Coordinador** (modelo caro, read-only) descompone tareas
- **Workers** (modelos baratos) ejecutan en paralelo
- **Semantic memory** con Ollama + `nomic-embed-text`
- **Pattern learning**: patrones se promueven o degradan según éxito
- **Cross-agent memory** (CASS): busca en historial de todos los agentes

### Integración con Cursor

Cursor lee `AGENTS.md` automáticamente como Cursor Rules. Además soporta `.cursor/rules/*.mdc` para reglas adicionales. Grok 4.5 en Composer es ideal para cuando necesitás orquestación visual guiada.

---

## 🏗️ Estructura propuesta para Cardinal

```
cardinal-system/
│
├── AGENTS.md                     # ← ACTUALIZAR: reglas unificadas + multi-agent
│
├── opencode.json                 # ← ACTUALIZAR: referencia a .opencode/
│
├── .opencode/                    # ← NUEVO
│   ├── opencode.jsonc            # Config multi-agent completa
│   │
│   ├── agent/
│   │   ├── orchestrator.md       # Primary agent: orquesta todo
│   │   ├── builder.md            # Subagent: implementa features
│   │   ├── reviewer.md           # Subagent: code review
│   │   ├── tester.md             # Subagent: tests (TDD)
│   │   └── docs.md               # Subagent: documentación
│   │
│   ├── command/
│   │   ├── feature.md            # /feature "desc" → feature completo
│   │   ├── review.md             # /review → code review del working tree
│   │   ├── test.md               # /test → TDD workflow
│   │   └── deploy.md             # /deploy → build + deploy
│   │
│   └── tool/                     # Custom tools (TypeScript)
│       └── README.md
│
└── .cursor/
    └── rules/
        └── cardinal.mdc          # ← NUEVO: rules para Cursor/Grok
```

---

## 🤖 Definición de agentes

### `orchestrator.md` (Primary Agent)

| Campo | Valor |
|-------|-------|
| Rol | Orquestador principal |
| Modelo | `deepseek-v4-flash` (o `claude-sonnet-4`) |
| Permisos | read-only, bash solo comandos seguros |
| Función | Descompone tareas, delega a subagentes vía @mention |

**System prompt outline:**
- Eres un orquestador. NO escribes código directamente.
- Descompón features en subtareas con dependencias
- Usa @builder, @tester, @reviewer, @docs para delegar
- Verifica resultados antes de marcar como completo
- Features chicas (1-2 archivos) hazlas directo; features grandes delega
- Workflow: plan → builder → tester (TDD) → reviewer → docs

### `builder.md` (Subagent)

| Campo | Valor |
|-------|-------|
| Rol | Implementador |
| Modelo | `deepseek-v4-flash` (o `claude-sonnet-4`) |
| Permisos | write/edit en `src/**/*.ts`, `src/**/*.tsx` |
| Función | Escribe código siguiendo specs del orquestador |

**System prompt outline:**
- Implementa exactamente lo spec. No agregues funcionalidad extra.
- Sigue las convenciones de AGENTS.md (stack, estilo, estructura)
- Bun runtime, WebSocket nativo, SQLite
- Código containerizado — no instales nada nativo

### `tester.md` (Subagent)

| Campo | Valor |
|-------|-------|
| Rol | Tester (TDD) |
| Modelo | `deepseek-v4-flash` (o `claude-haiku-4`) |
| Permisos | write en `tests/**/*.test.ts`, bash para correr tests |
| Función | Escribe tests primero (RED), después builder hace GREEN |

**System prompt outline:**
- TDD estricto: RED → GREEN → REFACTOR
- Tests primero, siempre
- Cobertura: ramas críticas cubiertas
- Usa `bun test` para correrlos

### `reviewer.md` (Subagent)

| Campo | Valor |
|-------|-------|
| Rol | Code reviewer |
| Modelo | `deepseek-v4-flash` (o `claude-sonnet-4`) |
| Permisos | read-only |
| Función | Revisa código sin modificarlo |

**System prompt outline:**
- Read-only. Nunca escribas archivos.
- Enfócate en: seguridad, rendimiento, estilo, edge cases
- Output estructurado: CRITICAL / HIGH / LOW

### `docs.md` (Subagent)

| Campo | Valor |
|-------|-------|
| Rol | Documentador |
| Modelo | `deepseek-v4-flash` (o `claude-haiku-4`) |
| Permisos | write en `docs/**/*.md` |
| Función | Docs técnicos siguiendo convenciones del vault |

---

## ⚡ Comandos custom

### `/feature "descripción"` — Workflow completo de feature

```
1. orchestrator analiza el request
2. orchestrator descompone en subtareas
3. @tester escribe tests (RED)
4. @builder implementa (GREEN)
5. @builder refactorea si es necesario (REFACTOR)
6. orchestrator corre tests para verificar
7. @reviewer hace code review
8. @docs actualiza documentación si aplica
9. orchestrator resume cambios y sugiere commit
```

### `/review` — Code review del working tree contra dev

```
1. @reviewer analiza diff contra dev
2. Reporta: bugs, security, style, suggestions
```

### `/test [path]` — TDD workflow para un archivo específico

```
1. @tester escribe test para el módulo
2. Corre test (debe fallar)
3. Sugiere @builder para implementar
```

### `/deploy` — Build + verificación + deploy

```
1. Build con Bun
2. Tests
3. Build container con Podman
4. Verifica healthcheck
```

---

## 📋 `opencode.json` raíz

El archivo raíz debe referenciar el directorio `.opencode/` y configurar defaults:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openrouter/deepseek/deepseek-v4-flash",
  "agent_directory": ".opencode/agent",
  "command_directory": ".opencode/command",
  "tools_directory": ".opencode/tool",
  "permission": {
    "bash": {
      "sudo *": "deny",
      "rm -rf /*": "deny"
    }
  },
  "agent": {
    "build": { "temperature": 0.3 },
    "plan": {
      "temperature": 0.1,
      "tools": { "write": false, "edit": false, "patch": false },
      "permission": { "bash": { "*": "deny" } }
    }
  }
}
```

---

## 🔄 `AGENTS.md` — Mejoras multi-agent

El AGENTS.md actual (bueno pero mono-agente) necesita:

- **Swarm workflow section**: cuándo usar `/feature` vs hacerlo directo
- **Agent roles table**: describir qué hace cada subagente
- **Delegation rules**: qué se delega y qué no
- **Orchestrator instructions**: cómo descomponer features
- **Cursor section**: notas para Grok 4.5 Composer

---

## 🖥️ `cursor/rules/cardinal.mdc` — Cursor + Grok 4.5

```markdown
---
description: Cardinal System development rules
globs: ["*.ts", "*.tsx", "*.json", "*.yaml"]
---
# Cardinal System - Cursor Rules

- Lee AGENTS.md para reglas completas
- Bun runtime, TypeScript
- Podman containers, no instalar nada nativo
- TDD: tests primero
- PRs: dev → main con merge commit
```

---

## 📦 Swarm plugin (opcional, futura expansión)

Si querés el swarm con learning memory:

```bash
npm install -g opencode-swarm-plugin
ollama pull nomic-embed-text
```

Esto habilita:
- `/swarm "feature"` → coordinador descompone, workers paralelos
- Semantic memory aprende de cada sesión
- Cross-agent session search (CASS)

---

## 🧩 Integración con el ecosistema SAO

Los agentes de OpenCode en Cardinal se mapean con el roster SAO:

| SAO Agent | OpenCode Agent | Rol |
|-----------|---------------|-----|
| Shinon 🏹 | orchestrator | Orquestación, planning, supervisión |
| Asuna 🌸 | docs | Documentación del vault |
| (nuevo) | builder | Implementación de features |
| (nuevo) | tester | Tests TDD |
| (nuevo) | reviewer | Code review |

Los SAO agents (Shinon, Asuna, Eugeo) corren en Hermes Agent (gateway). Los OpenCode agents (builder, tester, reviewer, docs) corren dentro de OpenCode en el repo. Son planos diferentes pero complementarios.

---

## 📐 Flujo de trabajo ideal

```
1. Santi abre `opencode` en cardinal-system/
2. OpenCode carga AGENTS.md + .opencode/agent/* + .opencode/command/*
3. Escribe: /feature "Add WebSocket heartbeat with auto-reconnect"
4. Orchestrator descompone el feature
5. @tester escribe test de heartbeat → RED
6. @builder implementa heartbeat module → GREEN
7. @reviewer revisa el código
8. @docs documenta el módulo
9. Orchestrator muestra resumen y sugiere commit message

10. (opcional) Santi abre Cursor con Grok 4.5 para refactor visual
11. Cursor lee AGENTS.md y .cursor/rules/cardinal.mdc
12. Grok 4.5 Composer entiende todo el contexto del proyecto
```

---

## 🚧 Fases de implementación

### Fase 1 — Fundación
- [ ] Crear `.opencode/` con estructura de directorios
- [ ] Crear `opencode.jsonc` multi-agent en `.opencode/`
- [ ] Crear archivos de agente (orchestrator, builder, tester, reviewer, docs)
- [ ] Crear comandos custom (feature, review, test, deploy)
- [ ] Actualizar `opencode.json` raíz
- [ ] Actualizar `AGENTS.md` con secciones multi-agent

### Fase 2 — Cursor
- [ ] Crear `.cursor/rules/cardinal.mdc`
- [ ] Verificar que Cursor levanta AGENTS.md correctamente

### Fase 3 — Swarm (opcional)
- [ ] Instalar `opencode-swarm-plugin`
- [ ] Configurar Ollama + embeddings
- [ ] Configurar semantic memory

### Fase 4 — Iteración
- [ ] Probar con feature real
- [ ] Ajustar prompts según resultados
- [ ] Agregar más subagentes si hacen falta

---

*Referencias: [OpenCode Agents Docs](https://opencode.ai/docs/agents/), [joelhooks/opencode-config](https://github.com/joelhooks/opencode-config), [joelhooks/swarm-tools](https://github.com/joelhooks/swarm-tools), [rothnic/opencode-agents](https://github.com/rothnic/opencode-agents)*
