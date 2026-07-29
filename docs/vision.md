# Cardinal System — Visión y Objetivos

> Por qué existe este proyecto. Para agentes nuevos que necesitan el "big picture".

---

## 🌐 Qué es

**Cardinal System** es el backend central del ecosistema SAO — un monolito TypeScript + Bun que:

- Conecta agentes sin importar dónde vivan (PC, laptop, celular)
- Provee contexto centralizado (memoria, RAG, historial)
- Emite API keys con scopes, budgets y failsafes
- Maneja autenticación y acceso humano
- Expone un dashboard web con estética Sword Art Online
- Eventualmente: grafo de conocimiento, automatizaciones, cron

---

## 🎯 Objetivo final

Que cualquier agente SAO — nuevo o existente — haga onboarding automático:

```
Agente nuevo → se conecta al Cardinal → recibe:
  ├── Su SOUL (personalidad)
  ├── Sus skills (capacidades)
  ├── Su memoria (contexto histórico)
  ├── Acceso al RAG del vault
  └── Una API key con presupuesto
```

Sin configurar nada a mano. El Cardinal es el source of truth.

---

## 🧭 Principios

- **Modular** — cada pieza intercambiable, sin acoplamiento forzado
- **Human-in-the-loop** — la palabra final es siempre del humano
- **Agent-less core** — el Cardinal no necesita saber qué es un agente; solo sirve contexto
- **Estética SAO** — identidad visual consistente en todo el dashboard
- **Seguridad primero** — nada expuesto sin auth, keys con límites

---

## 📐 No-objetivos (lo que NO es)

- ❌ Un router de modelos (aunque incluye uno)
- ❌ Un dashboard de monitoreo (aunque tiene uno)
- ❌ Un orquestador de tareas (los agentes se autogestionan)
- ❌ Un reemplazo de Hermes Agent
- ❌ Un producto SaaS — es infraestructura personal

---

## 🔗 Dónde está todo

| Recurso | Ubicación |
|---------|-----------|
| Reglas de desarrollo | [`AGENTS.md`](../AGENTS.md) |
| Stack técnico | [`docs/stack.md`](stack.md) |
| Seguridad | [`docs/security.md`](security.md) |
| Roadmap | [`docs/roadmap.md`](roadmap.md) |
| Ecosistema SAO | [`context/ecosystem.md`](../context/ecosystem.md) |
| Specs por fase | [`docs/superpowers/specs/`](superpowers/specs/) |

---

*Actualizado: 2026-07-28.*
