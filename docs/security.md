# Cardinal System — Modelo de Seguridad

> Reglas de seguridad que todo agente debe conocer antes de tocar código.

---

## Principios

- **Nada expuesto sin auth.** Todo endpoint bajo `/api/` requiere JWT o API key.
- **Keys son identidad.** `sk-cardinal-*` = el agente. En DB solo hash SHA-256.
- **Human-in-the-loop.** El humano cierra cada loop (merge, confirmación, gates).
- **Efímero por default.** Estado en git/DB, nunca en el proceso.
- **Fail-closed.** Si algo falla, denegar. Nunca permitir por defecto.

---

## Autenticación

| Actor | Método | Storage | Lifetime |
|-------|--------|---------|----------|
| Humano (dashboard) | JWT (HS256) via `POST /api/auth/login` | Cookie `httpOnly`, `SameSite=Strict` | 12h |
| Agente (WS) | API key `sk-cardinal-*` en mensaje `hello` | DB: `key_hash` (SHA-256) | Revocable |
| Agente (REST) | API key `sk-cardinal-*` via `Authorization: Bearer` | Igual que WS | Revocable |
| Subagente (localhost) | API key `created_by=system`, auto-revocable | DB: `key_hash` | Efímera |

---

## API Keys

- **Formato:** `sk-cardinal-<64 chars hex>` (77 chars total)
- **Generación:** `crypto.getRandomValues(new Uint8Array(32))` → hex
- **Hash:** SHA-256 (solo el hash se persiste en DB)
- **Revocación:** `revoked_at` timestamp. Keys revocadas rechazan con 4401.
- **Keys humanas (`created_by='human'`):** Jamás se tocan automáticamente. Solo acción explícita del humano.
- **Keys del sistema (`created_by='system'`):** Se crean y revocan automáticamente para one-shot agents.

---

## Permisos

| Nivel | Scope |
|-------|-------|
| Admin (humano) | Todo: dashboard, keygen, config. RAG sin filtrar. Tasks/mailbox con identidad del body. |
| Agent key | Conexión WS + uso del router. RAG filtrado por scopes JSON de la key (`*` o `vault:<name>`). En `/api/tasks` y `/api/messages` la key **es** identidad (`agent_name`). |
| Subagent key | Solo ejecución de una tarea (efímera, scoped) |

Vault scopes en `POST /api/rag/search` se enforcean server-side para agent keys. Scopes más finos (lectura/escritura por servicio, p.ej. `board`) siguen pendientes.

---

## Datos sensibles

| Qué | Dónde NO va | Dónde SÍ va |
|-----|-------------|-------------|
| `.env` (JWT_SECRET, credenciales) | ❌ Git, logs, diffs | Solo en el server |
| Password admin en texto plano | ❌ Chat de agentes, logs, git, tickets | Solo TTY local del humano (stdin, sin echo) |
| API keys en texto plano | ❌ Git, logs, DB | Solo se imprimen UNA vez al crearlas |
| Tokens, secrets, paths absolutos | ❌ Commits, PR descriptions | — |
| `.env.example` | — | ✅ Template sin valores reales |

---

## Bootstrap de password admin (imprescindible pre-nube)

Decisión 2026-08-20 (Santi): en **dev/testing local** cualquier password sirve
(incluso una generada en sesión de agente). Eso **no** es el flujo de producción.

Antes del primer deploy a la nube — aunque el único usuario sea el owner —
el alta o rotación de `ADMIN_PASSWORD_HASH` **no puede pasar por el modelo**.
La password en claro entra al contexto del agente, queda en transcripts y se
puede filtrar. Un usuario no invalida el requisito.

**Flujo requerido (aún no implementado — blocker de deploy cloud):**

1. Script interactivo en TTY del humano (`read -s` / equivalente): pide la
   password, no la imprime, no la loguea.
2. Hashea con `Bun.password.hash` **en esa misma máquina**.
3. Escribe **solo el hash** a `~/.config/cardinal/env` o a un Podman secret.
4. El agente puede saber que el bootstrap corrió (ok/fail). Nunca ve ni genera
   el plaintext. Tampoco lo pide "pasámela por el chat".

Hasta que ese script exista, el cloud deploy no se considera listo. Detalle de
seguimiento: item 11 del
[`plan de backlog v2`](superpowers/plans/2026-08-17-cardinal-v2-backlog.md).

---

## Auditoría pre-push

Antes de cada push a `dev`:

- [ ] `grep -r "sk-cardinal-" --include="*.ts" --include="*.json"` → cero resultados
- [ ] `grep -r "JWT_SECRET" --include="*.ts"` → solo `process.env.JWT_SECRET`
- [ ] No hay paths absolutos (`/home/snatty/`) en código
- [ ] No hay emails ni tokens en comentarios o strings

---

## WS Security

- **Close codes:** 4401 (auth failed), 4400 (invalid message)
- **Timeout:** 2 pings perdidos (60s) → desconexión
- **Rate limit:** No implementado en F0. Pendiente F2.

---

*Actualizado: 2026-09-06.*
