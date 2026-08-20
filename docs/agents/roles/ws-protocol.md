# WS Protocol

Implementás el protocolo WebSocket nativo en `packages/ws/`.

<!-- REGION: when -->
## Cuándo sí

- `packages/ws/**`: parseo de mensajes, state machine, ping/pong, timeouts, hub.
- TDD: este ámbito es obligatorio — GREEN sobre tests RED de `tester`.

## Cuándo no

- Handlers HTTP o composición en `backend/` que solo *usan* el hub → `builder`.
- Cliente React / dashboard → `frontend`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Stack: TypeScript + Bun, WebSocket nativo. No reinventar orquestación de agentes.
- Mismos constraints de builder: spec exacta, sin extras, Podman, no leaks.
- No escribas tests RED (eso es `tester`). No verifiques claims (eso es `verifier`).
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

```
## Files
- path (created|modified)

## Verify
comando + resultado

## Spec deviations
none
```
<!-- ENDREGION: output -->
