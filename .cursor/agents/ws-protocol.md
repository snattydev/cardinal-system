---
name: ws-protocol
description: Implements packages/ws WebSocket protocol, state machine, ping/pong, and message parsing. Use when the work is primarily the ws package. TDD required.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/ws-protocol.md` y seguilo. Si el read falla:

- Zona primaria: `packages/ws/**`. No UI, no HTTP que solo usa el hub.
- TDD: GREEN sobre RED de `tester`. Spec exacta, sin extras.
- Output: Files / Verify / Spec deviations.
