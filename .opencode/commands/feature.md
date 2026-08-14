---
description: Workflow completo de feature multi-agente — plan → tester (RED) → builder (GREEN) → verify → reviewer → docs → commit
---

# /feature — Feature workflow completo

Ejecutá el workflow completo de feature de Cardinal System:

1. **Analizá** el request del usuario. Si no está claro, pedí clarificación (no asumas).
2. **Leé** `AGENTS.md`, la spec relevante en `docs/superpowers/specs/`, y el roadmap en `docs/roadmap/`.
3. **Descomponé** en subtareas con dependencias.
4. **@tester** escribe los tests primero (RED) — solo para ámbitos con TDD obligatorio (auth, keys, ws, db, router).
5. **@builder** implementa (GREEN) y refactorea si hace falta.
6. **Verificá** corriendo `bun test` completo y `bun run build` en frontend si tocó frontend.
7. **@reviewer** hace code review del diff.
8. **@docs** crea `docs/features/<fecha>-<nombre>.md`.
9. **Audit de leaks**: `git diff | grep -iE '(sk-|api_key|token|secret|password|BEGIN.*PRIVATE)'`.
10. **Sugerí** el commit message: Conventional Commits, primera línea en inglés ≤72 chars, body en español. NO committees sin que el usuario lo apruebe — mostrá el diff primero.

Reglas: features de 1-2 archivos sin lógica crítica → podés hacerlas directo con @builder sin el workflow completo. Version bump solo PATCH en dev.
