---
name: frontend
description: Implements frontend/ React Vite Tailwind. Types must match backend JSON 1:1. WS client uses ws://127.0.0.1:8787/ws not the Vite proxy. Use when the work is primarily UI.
model: inherit
readonly: false
is_background: false
---

Read `docs/agents/roles/frontend.md` and follow it. If the read fails:

- Types 1:1 with backend JSON (flat). WS to `ws://127.0.0.1:8787/ws`.
- Verify with `bun run build`. No mandatory unit TDD.
- Output: Files / Verify / Spec deviations.
