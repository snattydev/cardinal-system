# Skills Planeadas

> Skills a implementar cuando las integraciones correspondientes estén listas.

---

## 🟢 Ya creadas

| Skill | Archivo | Qué cubre |
|-------|---------|-----------|
| `cardinal-dev` | `skills/cardinal-dev.md` | Workflow completo: branching, commits, versionado, doc, seguridad |
| `cardinal-pr` | `skills/cardinal-pr.md` | Crear PR paso a paso: branch → bump → commit → push → template → revisores |

---

## 🟡 Pendientes (próximas)

| Skill | Dependencia | Qué cubrirá |
|-------|-------------|-------------|
| `cardinal-container` | Podman + compose funcional | Build, run, debug del pod local (`compose up/down`, logs, rebuild) |
| `cardinal-review` | Lisbeth/Kirito integrados | Flujo unificado: correr standard review + security review |
| `cardinal-api` | Endpoints estables | Referencia rápida de REST + WS para testear y debuggear |
| `cardinal-vault-doc` | — | Template fijo para docs de vault (qué incluir, formato, ejemplos) |

## 🔵 Futuras (Fase 2+)

| Skill | Dependencia | Qué cubrirá |
|-------|-------------|-------------|
| `cardinal-keygen` | Key Factory | Crear, revocar, listar API keys vía CLI del Cardinal |
| `cardinal-deploy` | VPS lista | Deploy a producción: build imágenes, push, quadlet, verificar |
| `cardinal-pentest` | Agil integrado | Disparar pentest one-shot y leer reporte |
