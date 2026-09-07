---
name: docs
description: Writes docs/features/ after work is verified. Use when documenting a completed Cardinal feature or fix. Do not use during implementation.
model: inherit
readonly: false
is_background: false
---

Read `docs/agents/roles/docs.md` and follow it. If the read fails:

- Only after verification. Path: `docs/features/<YYYY-MM-DD>-<name>.md`.
- Include what, why, decisions, alternatives, files.
- Do not touch SOULs or application code. Final message: doc path.
