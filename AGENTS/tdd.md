# Test-Driven Development (TDD)

Repo TDD rules. Policy: RED → GREEN → REFACTOR → COMMIT.

## Scopes with mandatory TDD

| Scope | What it covers | Risk if it fails |
|-------|----------------|------------------|
| **Auth** | JWT sign/verify, expiration, login flow, cookie | Unauthorized access to the system |
| **Keys** | Generation, SHA-256 hashing, validation, revocation | Agent identity impersonation |
| **WS protocol** | Message parsing, state machine, ping/pong, timeout | Silent disconnections, corrupted state |
| **DB** | Migrations, schema integrity, critical queries | Data loss, corruption |
| **Router** | Fallback chain, rate limiting, budget enforcement | Uncontrolled external API consumption |

## TDD flow per feature

```
1. RED     → bun test --watch              # write the test that FAILS
2. GREEN   → minimum implementation        # run the test → PASSES
3. REFACTOR → clean up without breaking tests # run the test → still PASSES
4. COMMIT  → only after GREEN              # never commit broken tests
```

## Scopes without mandatory TDD

| Scope | Verification |
|-------|--------------|
| Frontend components | `bun run build` (typecheck + Vite build) |
| CSS / styles | Visual review (manual) |
| Docs, configs, deploy | Human review |

## Repo commands

- `bun test` — full suite (packages + backend)
- `bun run typecheck` — `tsc --noEmit` backend + frontend
- `bun run build` — frontend production build
- `bun run test:e2e` — Playwright dashboard flows (optional gate for UI changes; requires running backend + Vite)

These commands are the gate before merge (`bun test`, `typecheck`, and `build` are mandatory; E2E when touching dashboard flows).
