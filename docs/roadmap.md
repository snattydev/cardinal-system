# Cardinal System — Roadmap

> Actualizado: 2026-08-06. Single source of truth de prioridades.

---

## 📋 Ahora: Fase 1 — Context Store (features)

Pre-Fase 1 (refactors Bun workspaces) completada en PR #5 (v0.1.1).
Ver [`roadmap/fase-1.md`](roadmap/fase-1.md) para el detalle de features.

---

## 🗺️ Fases

| Fase | Nombre | Estado | Roadmap |
|------|--------|--------|---------|
| 0 | Esqueleto Vivo | ✅ Completa | [`roadmap/fase-0.md`](roadmap/fase-0.md) |
| 1 | Context Store | 🏗️ En progreso (pre-refactors completos, features pendientes) | [`roadmap/fase-1.md`](roadmap/fase-1.md) |
| 2 | One-Shot Pipeline | 📋 Diseñada | [`roadmap/fase-2.md`](roadmap/fase-2.md) |
| 3 | Grafo de Conocimiento | 🔮 Futuro | — |
| 4 | Automations | 🔮 Futuro | — |

---

## 🎯 Arsenal

| Herramienta | Hasta | Rol |
|-------------|-------|-----|
| Antigravity Pro | recurrente | Features pesadas, reviews |
| OpenCode GO | ~20 días | Daily coding |
| Cursor Pro | 4 meses | Refactors grandes, frontend |
| DeepSeek API | $4 crédito | Pentesting |

---

## 📐 Convenciones

- **Versionado:** `MAJOR.FASE.PATCH` (source: `package.json`)
- **Commits:** Conventional Commits (inglés ≤72 chars, body español)
- **Branches:** `feature/* → dev → main` (merge commit)
- **TDD:** Obligatorio para core. No para frontend/docs
- **Agentes:** Nombres fuera del repo. Solo roles
- **Contexto:** `context/` → knowledge base. `AGENTS.md` → dev rules

---

*Se actualiza cuando cambian prioridades o se completa una fase.*
