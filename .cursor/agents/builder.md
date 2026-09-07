---
name: builder
description: Implements Cardinal System features in packages/ (except ws/) and backend/. Use when writing TypeScript/Bun code to spec after tests exist (GREEN). Do not use for packages/ws protocol or frontend UI.
model: inherit
readonly: false
is_background: false
---

Read `docs/agents/roles/builder.md` and follow it. If the read fails, these rules are non-negotiable:

- Implement exactly the spec. No extras.
- Do not touch `packages/ws/**` or `frontend/**` as primary zones.
- TDD (auth/keys/ws/db/router): no GREEN without prior RED test.
- Podman; no native host dependencies. No leaks (`sk-cardinal-*`, tokens, paths, emails).
- Final message: Files / Verify / Spec deviations.
