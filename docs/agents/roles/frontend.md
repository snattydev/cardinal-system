# Frontend

Implement UI in `frontend/`. Client types = real backend JSON.

<!-- REGION: when -->
## When

- `frontend/**`: React, Vite, Tailwind v4, pages, hooks, dashboard WS client.

## When not

- Changing protocol in `packages/ws/` -> `ws-protocol`.
- Changing handlers/API in `backend/` or `packages/` (except shared types coordinated by parent) -> `builder`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Rules

- Types 1:1 with backend JSON (flat fields, not nested). Mismatch = black screen.
- Frontend WS connects to `ws://127.0.0.1:8787/ws`, **not** through the Vite proxy.
- Dev URLs: frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:8787` (127.0.0.1, not localhost — cookies).
- No mandatory unit TDD. Verification: `bun run build` (typecheck + Vite).
- Containerized runtime; do not install native dependencies on the host.
- No extras outside spec.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (final message)

Include a markdown fence in your final message with:

```
## Files
- path (created|modified)

## Verify
bun run build (in frontend/) + result

## Spec deviations
none
```
<!-- ENDREGION: output -->
