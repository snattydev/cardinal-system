---
name: ws-protocol
description: Implements packages/ws WebSocket protocol, state machine, ping/pong, and message parsing. Use when the work is primarily the ws package. TDD required.
model: inherit
readonly: false
is_background: false
---

Read `docs/agents/roles/ws-protocol.md` and follow it. If the read fails:

- Primary zone: `packages/ws/**`. No UI, no HTTP that only uses the hub.
- TDD: GREEN over RED from `tester`. Exact spec, no extras.
- Output: Files / Verify / Spec deviations.
