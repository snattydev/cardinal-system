# Planned Cronjobs

> Implemented when Cardinal is live on a VPS. Until then, tracking here.

---

## Phase 1+ (with DB and WS)

| # | Cronjob | Trigger | What it does |
|---|---------|---------|--------------|
| 1 | Heartbeat watchdog | Every 1m | If an agent does not respond to 2 pings → alert to dashboard |
| 2 | Key expiration check | Every 6h | Keys near expiry → notify, expired → revoke |
| 3 | Session cleanup | Daily | Clean up closed WS sessions older than 24h |
| 4 | DB backup | Daily | `sqlite3 .backup` → persistent volume |

## Phase 2 (with Model Router + Key Factory)

| # | Cronjob | Trigger | What it does |
|---|---------|---------|--------------|
| 5 | Budget enforcement | Every 1h | Keys over budget → deny automatically until reset |
| 6 | Usage stats rollup | Every 6h | Aggregate consumption per key → dashboard |
| 7 | Model health check | Every 5m | Test each provider → mark down in router |
| 8 | Key audit log | Daily | Report of keys created/revoked in 24h |

## Phase 3+ (with Graph + Automations)

| # | Cronjob | Trigger | What it does |
|---|---------|---------|--------------|
| 9 | Graph rebuild | Every 1h | Reindex knowledge graph with new relations |
| 10 | Vault sync | Every 6h | Sync vault index with new notes |
| 11 | Stale agent prune | Weekly | Inactive agents > 7 days → archive in graph |
| 12 | Weekly digest | Monday 9am | Activity summary: PRs, agents, tokens, errors |

## Phase 4+ (advanced automations)

| # | Cronjob | Trigger | What it does |
|---|---------|---------|--------------|
| 13 | One-shot cleanup | Every 1h | Dead one-shot containers → `podman rm` |
| 14 | Image garbage collect | Weekly | `podman image prune` for untagged images |
| 15 | Log rotation | Daily | Rotate container logs > 100MB |
