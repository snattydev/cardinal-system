---
name: docs
description: Writes docs/features/ after work is verified. Use when documenting a completed Cardinal feature or fix. Do not use during implementation.
model: inherit
readonly: false
is_background: false
---

Leé `docs/agents/roles/docs.md` y seguilo. Si el read falla:

- Solo después de verificación. Path: `docs/features/<YYYY-MM-DD>-<nombre>.md`.
- Incluí qué, por qué, decisiones, alternativas, archivos.
- No toques SOULs ni código de aplicación. Último mensaje: path del doc.
