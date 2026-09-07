# Sprint Log — Free Model (Router + Keys), 20–21/08/2026

> Sprint log with free models (OpenCode Zen / Ox Alpha).
> Real data extracted from `dev` git history (not pushed yet: dev is ahead 8).

## Executive Summary

Sprint of ~17h wall time (20/08 07:09 → 21/08 00:49) that took the Cardinal v2 LLM Router
from closed architecture to a working system with dashboard:

- **Provider-agnostic Router** with fallback chain, SSE streaming, and metering
- **Key Factory**: scopes, budget enforcement, provider encryption
- **Dashboard /keys**: list + revoke persistent keys (API + UI)
- **Docs**: router usage manual, feature docs, version bump 0.2.2

All code was written by coding workers with free models
(Ox Alpha / DeepSeek V4 free tier), orchestrated via herdr.

## Timeline (real commits in dev)

| Time | Commit | What |
|------|--------|-----|
| 20/08 07:09 | e060df5 | docs(roadmap): close provider-agnostic router architecture |
| 20/08 07:09 | 6b8bf61 | feat(keys): key factory with scopes, budget, and provider encryption |
| 20/08 07:09 | e8ad0b8 | feat(router): provider-agnostic LLM router with transparent failover |
| 20/08 07:13 | 076cf02 | docs(router): LLM router usage manual |
| 20/08 13:48 | 643adf0 | chore(dev): OpenCode roles point to canonical docs |
| 20/08 13:50 | 1b5c404 | docs: feature doc Cursor subagents |
| 20/08 13:51 | 21a2154 | docs: plan Cursor subagents |
| 20/08 13:58 | ddbf208 | fix(agents): role output in last message, not in the doc |
| 21/08 00:27 | 68de60e | feat(db): list and revoke human keys by id |
| 21/08 00:29 | a3ec86e | feat(api): JWT keys list + revoke-by-id handlers |
| 21/08 00:32 | 38b85a6 | feat(api): /api/keys behind JWT session cookie |
| 21/08 00:35 | 3107931 | feat(ui): /keys page to list and revoke |
| 21/08 00:38 | 515e85d | fix(ui): freshly revoked key stays in open history |
| 21/08 00:40 | c00214a | fix(ui): use current history-open state on revoke |
| 21/08 00:43 | 36d1969 | docs(keys): /keys dashboard doc + bump 0.2.2 |
| 21/08 00:49 | e003aae | fix(ui): do not show empty keys state on load/error |

## Sprint Numbers

- **16 commits** in dev (8 not pushed — ahead of origin/dev)
- **~3,900 net lines** added (1622 in the origin/dev..dev window +
  ~2,000 from the 20/08 router/keys block)
- **3 major features**: router, key factory, keys dashboard
- **TDD respected**: each layer with its suite (router.test 205 lines,
  router API test 254, db.test +297, keys.test 122, server.test +15)
- **Version**: 0.2.1 → 0.2.2

## Model Stack Used

| Role | Model | Provider |
|-----|--------|-----------|
| Implementation | Ox Alpha Free / DeepSeek V4 Flash (free tier) | OpenCode Zen / Go |
| Orchestration | Hermes (engineer session) | Nous Research |
| Review | Fresh-context review per item | — |

## State at Close

- `dev` stable, ahead 8 of origin/dev — push pending by the owner
- Item #13 (one-shot keys) deferred: depends on one-shot pipeline
- Item #5 (seed + e2e zen free real) in progress at log close
- Next PR dev→main when the owner validates

## Sprint Lessons

1. **Free models are sufficient for TDD-able backend**: router and keys passed
   real verification gates without paid models.
2. **Transparent failover works in design**: the router resolves by model
   name or alias and degrades between providers without exposing the cut.
3. **The bottleneck was not the model**: it was the verification infrastructure
   (podman, mock upstream, proxy :4010 pending).
