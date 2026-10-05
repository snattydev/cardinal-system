# Fusion routes honor USD key budgets (2026-10-05)

## Context

`routeCompletion` enforces `budget_usd_limit` on sequential failover: each successful hop charges `(total_tokens / 1e6) * cost_per_mtok`, and a charge that does not fit revokes the key. Fusion (mixture-of-agents) metered token budget and usage rows, but its copy of `meterSuccess` never called `consumeBudgetUsd`. A key whose only cap was USD could call a fusion alias indefinitely while `budget_usd_used` stayed 0.

## What was done

Fusion metering now matches sequential failover. When the key has `budget_usd_limit`, each successful proposer and the judge charge USD from that hop's `cost_per_mtok`. If a charge does not fit, the key is revoked and the judge is not called once proposer charges have already revoked it. Keys with no USD limit are unchanged.

## Why

USD limits are the spend control for provider cost. Leaving fusion outside that control bills real upstream calls with no cap and no recorded use.

## Decisions

- Same post-paid hop semantics as sequential failover: a single hop that exceeds the remaining cap revokes the key and leaves `budget_usd_used` unchanged for that hop.
- No shared helper extraction. The fusion meter keeps its own function and now includes the USD branch.

## Verification

- `bun test packages/router/src/fusion.test.ts` — USD is summed across 28 tokens at `cost_per_mtok` 2; a proposer charge above the cap revokes the key and does not call the judge.
- `bun test packages/router/src/router.test.ts` — sequential USD behavior unchanged.
