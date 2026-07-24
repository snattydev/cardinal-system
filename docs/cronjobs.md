# Cronjobs Planeados

> Se implementan cuando Cardinal esté vivo en VPS. Mientras tanto, acá llevamos track.

---

## 🟢 Fase 1+ (con DB y WS)

| # | Cronjob | Trigger | Qué hace |
|---|---------|---------|----------|
| 1 | Heartbeat watchdog | Cada 1m | Si un agente no responde 2 pings → alerta al dashboard |
| 2 | Key expiration check | Cada 6h | Keys near expiry → notificar, expired → revocar |
| 3 | Session cleanup | Diario | Limpiar sesiones WS cerradas hace > 24h |
| 4 | DB backup | Diario | `sqlite3 .backup` → volumen persistente |

## 🟡 Fase 2 (con Model Router + Key Factory)

| # | Cronjob | Trigger | Qué hace |
|---|---------|---------|----------|
| 5 | Budget enforcement | Cada 1h | Keys over budget → denegar automáticamente hasta reset |
| 6 | Usage stats rollup | Cada 6h | Agregar consumo por key → dashboard |
| 7 | Model health check | Cada 5m | Probar cada provider → marcar caídos en router |
| 8 | Key audit log | Diario | Reporte de keys creadas/revocadas en 24h |

## 🔵 Fase 3+ (con Grafo + Automations)

| # | Cronjob | Trigger | Qué hace |
|---|---------|---------|----------|
| 9 | Graph rebuild | Cada 1h | Reindexar grafo de conocimiento con nuevas relaciones |
| 10 | Vault sync | Cada 6h | Sincronizar índice de vault con nuevas notas |
| 11 | Stale agent prune | Semanal | Agentes inactivos > 7 días → archivar en grafo |
| 12 | Weekly digest | Lunes 9am | Resumen de actividad: PRs, agentes, tokens, errores |

## 🔴 Fase 4+ (Automations avanzadas)

| # | Cronjob | Trigger | Qué hace |
|---|---------|---------|----------|
| 13 | One-shot cleanup | Cada 1h | Contenedores one-shot muertos → `podman rm` |
| 14 | Image garbage collect | Semanal | `podman image prune` de imágenes sin tag |
| 15 | Log rotation | Diario | Rotar logs de contenedores > 100MB |
