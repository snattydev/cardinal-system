---
name: frontend
description: Implements frontend/ React Vite Tailwind. Types must match backend JSON 1:1. WS client uses ws://127.0.0.1:8787/ws not the Vite proxy. Use when the work is primarily UI.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/frontend.md` y seguilo. Si el read falla:

- Types 1:1 con JSON del backend (flat). WS a `ws://127.0.0.1:8787/ws`.
- Verify con `bun run build`. No TDD unitario obligatorio.
- Output: Files / Verify / Spec deviations.
