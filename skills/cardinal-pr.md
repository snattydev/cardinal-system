---
name: cardinal-pr
description: Crear un Pull Request en Cardinal System — branch, bump version, commit, push, abrir PR, llenar template y asignar revisores.
category: development
---

# Cardinal System — Crear un Pull Request

## ⚠️ Regla fundamental
El orquestador abre PRs, el humano mergea. Jamás auto-merge.

---

## Flujo completo

### 1. Branch

```bash
git checkout dev
git pull origin dev
git checkout -b <type>/<desc>
```

Tipos: `feat/`, `fix/`, `chore/`, `docs/`

### 2. Cambios

- Delegar implementación a subagente one-shot
- Verificar resultado: archivos, coherencia, leaks
- Documentar en `docs/features/` (crear el .md)

### 3. Version bump

**Solo si el PR es a `main`.** En PRs a `dev` no se toca la versión.

```bash
# Evaluar qué bump según lo acumulado:
# PATCH: fixes, security, docs, chores  → 0.0.2 → 0.0.3
# MINOR: nuevas features                 → 0.0.3 → 0.1.0
# MAJOR: breaking changes                → 0.1.0 → 1.0.0

# Editar package.json → "version": "X.Y.Z"
```

### 4. Commit

```
<type>(<scope>): <breve en inglés>

<Cuerpo en español: qué y por qué.>
```

Ejemplo:
```
feat(ws): add agent heartbeat with ping/pong protocol

Health check sobre WebSocket con 30s de intervalo. 2 pings
perdidos marcan al agente como offline en el dashboard.
```

### 5. Push y PR

```bash
git push -u origin <branch>
gh pr create --base dev --title "<título>" --body "$(cat .github/PULL_REQUEST_TEMPLATE.md)"
```

- PR siempre a `dev`, NUNCA directo a `main`
- El PR a `main` se hace solo cuando `dev` está estable (PR `dev → main`)

### 6. Template

Llenar con `.github/PULL_REQUEST_TEMPLATE.md` — resumen ejecutivo, el detalle va en doc de vault.

### 7. Revisores (solo PRs a `main`)

| PR a | Revisores |
|------|-----------|
| `dev` | Ninguno — merge directo |
| `main` | Standard Reviewer (automático), Security Reviewer (bajo demanda) |

---

## Verificaciones pre-PR

- [ ] Branch creada desde `dev` actualizado
- [ ] Sin leaks: `git diff dev..HEAD | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'`
- [ ] Versión bump si aplica
- [ ] Commit message en formato conventional commits, cuerpo en español
- [ ] PR template lleno
- [ ] Doc en `docs/features/` creado
- [ ] PR apunta a `dev` (no a `main`)
- [ ] Skills sincronizadas: `bash skills/sync-skills.sh`
