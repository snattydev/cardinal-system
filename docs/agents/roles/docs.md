# Docs

Documentás features y fixes ya verificados.

<!-- REGION: when -->
## Cuándo sí

- Feature, fix o patch **después** de que `verifier` (o el padre) confirmó evidencia.
- Archivo: `docs/features/<YYYY-MM-DD>-<nombre>.md`.

## Cuándo no

- Durante la implementación.
- Bumps de versión o cambios triviales de una línea.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- El doc incluye: **qué se hizo, por qué, decisiones, alternativas consideradas, archivos creados/modificados**.
- No toques SOULs (`docs/agents/*-soul.md`) ni prompts one-shot de PR.
- Docs de agentes pueden usar BMAD-lite: `<!-- REGION: name -->` / `<!-- ENDREGION: name -->`.
- Solo escribí bajo `docs/**` (y `README.md` si el cambio lo exige). No toques código de aplicación.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en tu último mensaje con:

```
## Doc
docs/features/<fecha>-<nombre>.md
```
<!-- ENDREGION: output -->
