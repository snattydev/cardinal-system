---
name: cardinal-commit
description: Formato y flujo de commits para Cardinal System — conventional commits, idioma, scope, ejemplos.
category: development
---

# Cardinal System — Commits

## Formato

```
<type>(<scope>): <descripción breve en inglés>

<Cuerpo en español: qué y por qué, no el cómo>
```

## Tipos

| Tipo | Cuándo |
|------|--------|
| `feat` | Nueva funcionalidad |
| `fix` | Bug fix |
| `chore` | Tareas de mantenimiento (bump, config, build) |
| `docs` | Solo documentación |
| `refactor` | Cambio de código sin feat ni fix |
| `test` | Agregar o modificar tests |
| `style` | Formato, linting, whitespace |

## Scope

Opcional pero recomendado. Usar el módulo o archivo principal:

```
feat(ws): add agent heartbeat
fix(auth): reject expired JWT
chore(deps): update bun to 1.2.0
docs(agents): add review workflow
```

## Reglas

1. **Primera línea ≤ 72 chars, en inglés**
2. **Cuerpo en español** — explicar *qué* y *por qué*
3. Separar subject del cuerpo con línea en blanco
4. Si cierra un issue: `Closes #N` al final del cuerpo
5. Un commit = un cambio lógico. No mezclar feat con fix.

## Ejemplos

✅ Bueno:
```
feat(ws): add agent heartbeat with ping/pong protocol

Implementación del keep-alive sobre WebSocket. El Cardinal
envía ping cada 30s y espera pong. Si fallan 2 pings
consecutivos, el agente se marca offline en el dashboard
y se emite evento agent_update a los suscriptores.
```

✅ Bueno:
```
fix(auth): return 401 instead of 500 on expired JWT

El middleware tiraba 500 genérico. Ahora verifica exp
explícitamente y responde 401 con mensaje descriptivo.
```

❌ Malo:
```
fix stuff
```
```
feat(ws): add agent heartbeat with ping/pong protocol. Implementación del keep-alive...
```

## Verificación pre-commit

```bash
# Auditar leaks
git diff --cached | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'

# Verificar formato
git log -1 --pretty=format:"%s" | grep -E '^(feat|fix|chore|docs|refactor|test|style)(\(.+\))?: .{1,72}'
```
