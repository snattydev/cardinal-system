# Keys Dashboard — diseño (listar + revocar)

> Fecha: 2026-08-20
> Estado: **aprobado** (brainstorm Santi). Spec persistida. Sin implementar.
> Relación: cierra el hueco UI de Fase 0 (“Keys → Fase 2”) ahora que el backend de keys existe.
> Próxima sesión: plan de implementación (`writing-plans`) → TDD API → página `/keys`.
> Fuera de este slice (anotado, no implementar): bloque live one-shot y borrado duro de keys one-shot.

---

## 0. Decisiones del brainstorm

| Pregunta | Elección |
|----------|----------|
| Primera task del gap UI | Keys (no router, no Overview global, no Hub) |
| Alcance | Ver + revocar. Crear sigue en `bun run keygen` |
| Granularidad revoke | Una key por `id` (no todas las del agente) |
| Dónde vive | Página `/keys` (ítem ya previsto en el dropdown Agents) |
| Historial | Fuera de la lista viva: control mínimo con **icono de log** |
| One-shot en esta pantalla | **No se construye ahora.** Layout acordado: bloque compacto **abajo a la izquierda**. Al terminar: hard-delete + rastro en el log del one-shot |

---

## 1. Problema

El backend tiene `agent_keys` (Fase 0 + factory: scopes, budget, revoke). La CLI
`bun run keygen` lista / crea / revoca. El dashboard no: el ítem Keys está
disabled con badge “Fase 2”, Settings dice “coming in Fase 2”, y Overview
muestra “Keys Active” sin a dónde ir.

Crear keys sigue en la CLI (el plaintext se imprime una vez). Esta spec no
agrega create en UI.

---

## 2. Alcance de este slice

**Entra:**

- Página `/keys` (habilitar el NavLink del dropdown Agents).
- `GET /api/keys` y `GET /api/keys?status=revoked` (JWT).
- `POST /api/keys/:id/revoke` (JWT) — una fila, no todas las del agente.
- Lista grande: keys **activas** de agentes persistentes (`created_by=human`).
- Historial: control **muy chico** (icono de log) que revela keys human
  **revocadas**. No conviven en la misma lista que las vivas.
- Overview “Keys Active” linkea a `/keys` y cuenta solo persistentes activas.
- Settings: sacar el placeholder “API KEYS MANAGEMENT coming in Fase 2”;
  link a `/keys`.

**No entra (anotado — arquitectura futura):**

Ver sección 6.

---

## 3. Persistente vs one-shot

Marcador existente: `agent_keys.created_by`.

| | Persistente (`human`) | One-shot (`system`) |
|--|----------------------|---------------------|
| Dónde se ve (este slice) | Lista grande si activa; historial (icono log) si revocada | No se lista |
| Revocar | Humano, explícito, por `id` | Auto / pipeline (no UI ahora) |
| Al terminar | `revoked_at` — queda en historial | **Hard delete** de la fila (futuro). No historial en `/keys`. El rastro vive en el **log del one-shot** |

Regla F0 intacta: keys `human` jamás se tocan automáticamente. Revocar desde el
dashboard **es** acción explícita del humano.

---

## 4. API

Auth: cookie JWT, igual que `/api/system`. Nunca Bearer de agente.

El JSON **no incluye** `key_hash` ni el plaintext.

### `GET /api/keys`

Default `status=active`.

Query:

- `status=active` (default) → `revoked_at IS NULL AND created_by='human'`
- `status=revoked` → `revoked_at IS NOT NULL AND created_by='human'`
- otro valor → 400

Item (camelCase, wire del dashboard):

```
id, agentName, createdBy, scopes[],
budgetLimit, budgetUsed, createdAt, lastUsedAt, revokedAt
```

`scopes` ya parseado (array). `budgetLimit` / `revokedAt` / `lastUsedAt` pueden
ser `null`.

Orden: `id` descendente (más reciente primero).

### `POST /api/keys/:id/revoke`

Setea `revoked_at = datetime('now')` en **esa** fila (`revokeKeyById`).

| Código | Cuándo |
|--------|--------|
| 200 | Fila actualizada; body = el item ya revocado |
| 401 | Sin sesión |
| 404 | id inexistente |
| 409 | Ya estaba revocada |
| 400 | id no numérico |

No hay DELETE HTTP. La CLI `keygen --revoke <agente>` (todas las activas de un
nombre) **no cambia**.

TDD obligatorio (`packages/db` + `backend/src/api/keys`).

---

## 5. UI

Ruta `/keys`, layout actual (sidebar SAO).

**Zona principal — persistentes vivas.**  
Tabla o stack de filas a ancho útil: agente, scopes, budget
(`used / limit` o `used / ∞`), created, last used, botón Revocar.
Confirmación corta antes de revocar (no modal pesado). Vacío: copy que apunte a
`bun run keygen -- --agent <name>` (crear sigue en CLI).

**Historial — componente mínimo.**  
No es una segunda tabla siempre visible. Un control chico (icono de log + label
corto tipo “pasadas” o sin label, solo icono) abre/cierra el listado de
revocadas human. Sin revoke. Si no hay ninguna, el control puede existir igual
(historial vacío).

**Sidebar.**  
El span disabled “Keys / Fase 2” pasa a `NavLink to="/keys"`.

**Overview.**  
Card “Keys Active” es un link a `/keys`. El número es persistentes activas, no
one-shot — hay que ajustar `getSystemCounts().keysActive` (hoy cuenta todas
las no revocadas).

**Settings.**  
Reemplazar el párrafo “coming in Fase 2” de API KEYS MANAGEMENT por un link a
`/keys`. El placeholder MODEL ROUTER se deja (otro slice).

Frontend: `bun run build` (sin TDD de componentes).

---

## 6. Fuera de scope — decisiones de arquitectura (no implementar ahora)

Anotado 2026-08-20 para no reabrir el debate cuando existan one-shots.

### 6.1 Bloque live one-shot en `/keys`

Cuando haya keys `created_by=system` **activas**, no van a la lista grande.
Van a un **componente aparte, compacto, abajo a la izquierda** de `/keys`:
título tipo `one-shot · N`, una línea/chip por key (nombre + budget restante),
revocar posible pero el bloque no reserva el layout de las persistentes. Si
N=0, el bloque no ocupa lugar.

Este slice **no** pinta ese bloque. `GET /api/keys` tampoco devuelve system
keys todavía; se agregará cuando exista el componente.

### 6.2 Ciclo de vida de la key one-shot

Hoy el router **auto-revoca** al explotar `budget_limit` (deja fila con
`revoked_at`). Eso sirve para persistentes y para e2e.

Cuando exista el pipeline one-shot:

1. Al terminar el agente (done / budget / timeout) → **borrar** la fila de
   `agent_keys` (hard delete), no revocar.
2. No entra al historial de `/keys`.
3. El rastro concreto (key id, tokens, por qué murió) vive en el **log de ese
   one-shot** — pieza de arquitectura propia, no este dashboard.

Hasta que eso exista, un `system` revocado por budget puede quedar en DB; la UI
de este slice lo ignora (`created_by='human'` en ambos GET).

---

## 7. Seguridad

- JWT admin only.
- Nunca `key_hash` ni `sk-cardinal-*` en responses ni en el DOM.
- Revoke es acción humana explícita; no se tocan keys human en background.
- Audit pre-push: cero `sk-cardinal-` en frontend.

---

## 8. Archivos previstos (implementación)

| Área | Archivos |
|------|----------|
| DB | `packages/db/src/repos.ts` (`revokeKeyById`; `keysActive` solo human) + `db.test.ts` |
| API | `backend/src/api/keys.ts` + `keys.test.ts`; registro en `server.ts` |
| UI | `frontend/src/pages/Keys.tsx`, `App.tsx`, `Layout.tsx`; link en `Overview.tsx` y `Settings.tsx` |

---

## 9. Verificación

- `bun test` — cases: list active/revoked filtra human; revoke 200/404/409;
  list response sin `key_hash`; 401 sin cookie.
- `bun run build` — frontend typecheck + Vite.
- Smoke: sidebar Keys abre `/keys`; revoke una key de prueba; icono log muestra
  historial; Overview card navega.

---

*Diseño de un slice. El bloque one-shot y el hard-delete viven en una spec
futura cuando el pipeline one-shot exista.*
