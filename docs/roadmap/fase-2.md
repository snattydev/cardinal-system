# Fase 2 — One-Shot Pipeline 📋

> Spec: [`../superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md`](../superpowers/specs/2026-07-23-cardinal-fase-2-one-shot-pipeline.md)
> Estado: Diseñada. Esperando completar Fase 1.

---

## 2.1 LLM Router (`/v1/chat/completions`)

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 2.1.1 | Tabla `model_routes` (task_type → primary → fallback) | Cursor Pro | Sí |
| 2.1.2 | Endpoint OpenAI-compatible `POST /v1/chat/completions` | Cursor Pro | Sí |
| 2.1.3 | Lógica de routing: task_type → lookup → fallback chain | Cursor Pro | Sí |
| 2.1.4 | Streaming response (SSE) | Antigravity | No |

## 2.2 API Key Factory

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 2.2.1 | Extender `agent_keys` con `scopes` (JSON) y `budget_limit` | Cursor Pro | Sí |
| 2.2.2 | Budget enforcement (tokens consumidos vs límite) | Cursor Pro | Sí |
| 2.2.3 | Dashboard de consumo por key | Cursor Pro | No |
| 2.2.4 | Keys dinámicas `created_by=system` (auto-revocables) | OpenCode GO | Sí |

## 2.3 One-Shot Agents

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 2.3.1 | API `POST /api/agents/run` (crea + ejecuta + destruye) | Cursor Pro | Sí |
| 2.3.2 | Integración Podman API (spawn container por tarea) | Antigravity | No |
| 2.3.3 | Lifecycle: create → run → collect output → destroy | Cursor Pro | Sí |

## 2.4 PR Review Pipeline

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 2.4.1 | Webhook endpoint `POST /api/webhooks/github` | Cursor Pro | Sí |
| 2.4.2 | Detectar PR opened → spawn one-shot review agent | Cursor Pro | Sí |
| 2.4.3 | Postear review como comment en GitHub PR | Antigravity | No |

## 2.5 @mention Trigger

| # | Tarea | Tool | TDD |
|---|-------|------|-----|
| 2.5.1 | Detectar `@cardinal-deep-review` en PR comments | Cursor Pro | Sí |
| 2.5.2 | Spawn one-shot agent con modelo premium (qwen3.7-max) | Cursor Pro | Sí |

---

## 📊 Progreso

```
F2 features:  0/16 ░░░░░░░░░░░░░░░░░░░░
```
