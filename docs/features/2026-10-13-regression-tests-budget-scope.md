# Regression tests for budgets, scopes, and credential edges (2026-10-13)

## What was done

Added tests only. Production behavior is unchanged.

- Router: a token budget already at its limit, including a limit of zero, is rejected before any upstream call and does not revoke the key. Model scopes match the requested id exactly. A provider with a null or blank API key is called without an `Authorization` header.
- Keys: an empty `scopes` array stays empty through create and validate. `null` or mixed scopes, and string or boolean budgets, are rejected before a row is inserted.
- Profiles and memory: an invalid kind, status, or sync direction does not create a row and does not rewrite an existing one.
- RAG cache: `top_k` is part of the cache key, and rewriting an expired row makes that query a hit again. An explicit blank vault token is not sent and does not fall back to `VAULT_PROXY_TOKEN`.
- Provider delete: removing a provider also removes its models and leaves other providers' models in place.
- Vault listing does not follow a symlink to files outside the vault.
- Secret decryption rejects a ciphertext shorter than the IV and auth tag.

## Why

These paths sit on spend control, authorization, and credential handling. A regression that treats a prefix as a wildcard, spends past a token budget, or forwards an environment vault token would not have been caught by the existing suites.

## Decisions

- Assert current behavior. No production edits.
- Keep each case on an in-memory database or a local mock, with no shared network beyond the router suite's existing loopback server.
- Leave fusion USD charging, worker protocol edges, and the cases already proposed in open coverage PRs alone.

## Files

- `packages/router/src/router.test.ts`
- `backend/src/api/keys.test.ts`
- `backend/src/api/api.test.ts`
- `packages/db/src/db.test.ts`
- `packages/rag/src/rag.test.ts`
- `packages/mcp/src/vaults.test.ts`
- `packages/keys/src/crypto.test.ts`
