# OpenCode Multi-Agent QOL — Design

> Setup de agentes, comandos y MCPs de OpenCode para dev onboarding en Cardinal System.
> Cursor (Grok 4.5) como orquestador visual; OpenCode CLI para implementación con subagentes.

---

## Arquitectura de uso

```
Cursor + Grok 4.5              OpenCode CLI
(orquestador visual)           (implementación)
        │                            │
        ├── Planning, review         ├── builder (implementa)
        ├── Refactors grandes        ├── tester (TDD)
        │                            ├── reviewer (code review)
        │                            └── docs (documentación)
        │                            │
        └──────── AGENTS.md ─────────┘
              .cursor/rules/cardinal.mdc
```

El dev elige según la tarea:
- **Cursor**: planning de features complejas, code review visual, refactors multi-archivo
- **OpenCode**: implementación concreta con `/feature`, TDD con `/test`, review rápido con `/review`

Ambos comparten reglas via `AGENTS.md` y `.cursor/rules/`.

---

## Archivos creados

```
cardinal-system/
├── .opencode/                       # NUEVO
│   ├── agents/
│   │   ├── orchestrator.md          # Primary agent: deepseek-v4-pro
│   │   ├── builder.md               # Subagent: implementación
│   │   ├── tester.md                # Subagent: TDD
│   │   ├── reviewer.md              # Subagent: code review read-only
│   │   └── docs.md                  # Subagent: documentación
│   └── commands/
│       ├── feature.md               # /feature workflow completo
│       ├── review.md                # /review code review
│       ├── test.md                  # /test TDD workflow
│       └── deploy.md                # /deploy build + verify
├── .cursor/
│   └── rules/
│       └── cardinal.mdc             # NUEVO — Cursor rules para Grok 4.5
```

## Archivos modificados

- `opencode.json` — expandido con model, default_agent, MCPs, permissions, instructions
- `AGENTS.md` — secciones nuevas: Swarm Workflow, Agent Roles, Delegation Rules, Cursor Section, OpenCode Config Reference

---

## Agentes OpenCode

### `orchestrator` (primary, `deepseek-v4-pro`)

Coordina subagentes. No escribe código — delega implementación a builder, tests a tester.
Usa skills de superpowers (`dispatching-parallel-agents`, `subagent-driven-development`, etc.).

**Permisos:** read-only en código, bash acotado (solo comandos seguros), `permission.task` permite invocar a builder, tester, reviewer, docs.

### `builder` (subagent, hereda modelo del primario)

Implementa features siguiendo specs del orchestrator. Stack: TypeScript + Bun, WebSocket nativo, SQLite.
No agrega funcionalidad extra, solo lo spec. Containerizado — no instala dependencias nativas.

**Permisos:** edit en `packages/**`, `backend/**`, `frontend/**`, `tests/**`.

### `tester` (subagent, hereda modelo del primario)

TDD estricto: RED → GREEN → REFACTOR. Escribe tests primero.
Cobertura de ramas críticas (auth, keys, ws, db, router).

**Permisos:** edit en `**/*.test.ts`, bash para `bun test`.

### `reviewer` (subagent, hereda modelo del primario)

Read-only code review. Enfocado en seguridad, rendimiento, estilo, edge cases.
Output estructurado: CRITICAL / HIGH / LOW.

**Permisos:** read-only, sin edit ni bash destructivo.

### `docs` (subagent, hereda modelo del primario)

Documentación técnica en `docs/features/`. Sigue convenciones del repo: qué, por qué, decisiones, alternativas, archivos.

**Permisos:** edit en `docs/**`, `README.md`.

---

## Comandos custom

### `/feature "descripción"`

Workflow completo: orchestrator descompone → @tester (RED) → @builder (GREEN + REFACTOR) → verify → @reviewer → @docs → sugiere commit.

### `/review`

@reviewer analiza diff contra `dev`. Reporta bugs, security, style, suggestions.

### `/test [path]`

@tester escribe test para el módulo, corre (debe fallar), sugiere @builder para implementar.

### `/deploy`

Build con Bun → tests → build container con Podman → verifica healthcheck.

---

## MCP servers

Solo el GitHub MCP se configura explícitamente. La regla `"mcp__*": "deny"` en permisos bloquea cualquier MCP externo que venga de config global o remota. Agregar un MCP nuevo es una entrada en `opencode.json` → `mcp` + quitar su namespace del deny.

MCPs postergados: SQLite (redundante, los agentes usan `bun:sqlite`), Cardinal API (overkill, backend es `bun run` local), Podman (bash directo es suficiente).

---

## `opencode.json` (reemplaza el actual)

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "openrouter/deepseek/deepseek-v4-flash",
  "default_agent": "orchestrator",
  "subagent_depth": 2,
  "instructions": ["AGENTS.md", ".cursor/rules/*.mdc"],
  "permission": {
    "bash": {
      "sudo *": "deny",
      "rm -rf /*": "deny"
    },
    "*": "allow",
    "mcp__*": "deny"
  },
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@anthropic/mcp-server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "{env:GITHUB_TOKEN}" }
    }
  },
  "tools": {
    "ZerrantHive_*": false,
    "pencil_*": false
  }
}
```

---

## AGENTS.md — adiciones

Secciones nuevas al final del archivo (sin modificar lo existente):

1. **Swarm Workflow** — cuándo usar `/feature` vs directo. Features de 1-2 archivos → directo; features con dependencias → `/feature`.
2. **Agent Roles Table** — referencia rápida de los 5 agentes.
3. **Delegation Rules** — qué delega el orchestrator. El orchestrator no escribe código, solo coordina, verifica y commitea.
4. **Cursor Section** — Grok 4.5 en Composer como orquestador visual, cuándo usar cada herramienta.
5. **OpenCode Config Reference** — paths y cómo extender.

---

## `.cursor/rules/cardinal.mdc`

Archivo de reglas para Cursor con frontmatter de glob patterns. Grok 4.5 en Composer lo carga como contexto. Contiene stack, convenciones, y guía de cuándo usar Cursor vs OpenCode.

---

## Extensibilidad

- **Agente nuevo:** crear `.opencode/agents/<nombre>.md` con frontmatter + system prompt
- **Comando nuevo:** crear `.opencode/commands/<nombre>.md`
- **MCP nuevo:** agregar entrada en `opencode.json` → `mcp`, quitar su namespace del deny de permisos
- **Cursor rule nueva:** crear `.cursor/rules/<nombre>.mdc`

---

## Referencias

- [OpenCode Agents Docs](https://opencode.ai/docs/agents/)
- [OpenCode Config Docs](https://opencode.ai/docs/config/)
- [OpenCode MCP Servers Docs](https://opencode.ai/docs/mcp-servers/)
- [`docs/guides/opencode-orchestration-plan.md`](../guides/opencode-orchestration-plan.md) — plan original que inspiró este diseño
