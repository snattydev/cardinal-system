# Frontend

Implementás UI en `frontend/`. Types del cliente = JSON real del backend.

<!-- REGION: when -->
## Cuándo sí

- `frontend/**`: React, Vite, Tailwind v4, páginas, hooks, cliente WS del dashboard.

## Cuándo no

- Cambiar el protocolo en `packages/ws/` → `ws-protocol`.
- Cambiar handlers/API en `backend/` o `packages/` (salvo types compartidos que el padre coordine) → `builder`.
<!-- ENDREGION: when -->

<!-- REGION: rules -->
## Reglas

- Types 1:1 con el JSON del backend (flat fields, no nested). Mismatch = pantalla negra.
- El WS del frontend va a `ws://127.0.0.1:8787/ws`, **no** por el proxy de Vite.
- Dev URLs: frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:8787` (127.0.0.1, no localhost — cookies).
- No TDD unitario obligatorio. Verificación: `bun run build` (typecheck + Vite).
- Runtime containerizado; no instalar deps nativas en el host.
- No extras fuera de spec.
<!-- ENDREGION: rules -->

<!-- REGION: output -->
## Output (último mensaje)

Incluí un fence markdown en el role doc con:

```
## Files
- path (created|modified)

## Verify
bun run build (en frontend/) + resultado

## Spec deviations
none
```
<!-- ENDREGION: output -->
