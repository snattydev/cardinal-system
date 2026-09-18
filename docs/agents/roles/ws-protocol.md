# WS Protocol

Implement the native WebSocket protocol in `packages/ws/`.

<!-- REGION: when -->
## When

- `packages/ws/**`: message parsing, state machine, ping/pong, timeouts, hub.
- TDD: this scope is mandatory — GREEN over RED tests from `tester`.

## When not

- HTTP handlers or composition in `backend/` that only *use* the hub -> `builder`.
- React client / dashboard -> `frontend`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Rules

- Stack: TypeScript + Bun, native WebSocket. Do not reinvent agent orchestration.
- Same builder constraints: exact spec, no extras, Podman, no leaks.
- Do not write RED tests (that is `tester`). Do not verify claims (that is `verifier`).
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (final message)

Include a markdown fence in your final message with:

```
## Files
- path (created|modified)

## Verify
command + result

## Spec deviations
none
```
<!-- ENDREGION: output -->
