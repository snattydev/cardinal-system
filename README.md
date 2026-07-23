# Cardinal System

Backend central del ecosistema de agentes SAO: login humano (JWT), dashboard web con estética SAO, Agent Hub en tiempo real vía WebSocket y API keys por agente (`sk-cardinal-*`). Monolito Bun + SQLite que sirve API, WS y los estáticos del frontend desde un único proceso — y en producción, desde un único contenedor.

**Versión:** v0.0.1 (Fase 0 — Esqueleto Vivo). Spec de diseño: [`docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md`](docs/superpowers/specs/2026-07-23-cardinal-fase-0-design.md).

## Requisitos

- [Bun](https://bun.sh) ≥ 1.2
- Podman (opcional, solo para el deploy de producción)

## Setup de desarrollo

```bash
git clone <repo-url> && cd cardinal-system

# Dependencias (backend y frontend son paquetes independientes)
cd backend && bun install && cd ..
cd frontend && bun install && cd ..

# Variables de entorno
cp deploy/env.example .env
bun -e 'console.log(await Bun.password.hash("your-password"))'  # → ADMIN_PASSWORD_HASH en .env
openssl rand -hex 32                                            # → JWT_SECRET en .env

# Crear la API key de un agente (se imprime UNA sola vez — guardarla)
bun run keygen -- --agent shinon

# Terminal 1: backend en http://localhost:8787
bun run dev:backend

# Terminal 2: frontend en http://localhost:5173 (proxy de /api y /ws al 8787)
bun run dev:frontend
```

Abrir http://localhost:5173 y loguearse con `ADMIN_USER` y la password hasheada.

## Agente de ejemplo

Con el backend corriendo, conectar el cliente WS de referencia con la key generada:

```bash
CARDINAL_AGENT_KEY=sk-cardinal-... bun examples/ws-agent.ts
```

El agente aparece online en el dashboard; al cerrarlo (Ctrl+C) envía `bye` y pasa a offline.

## Producción (Podman + Quadlet + Caddy)

```bash
# 1. Build de la imagen (un solo contenedor: API + WS + estáticos)
podman build -t cardinal-system -f deploy/Containerfile .

# 2. Unidades Quadlet y secretos
mkdir -p ~/.config/containers/systemd ~/.config/cardinal
cp deploy/quadlet/cardinal.container deploy/quadlet/cardinal-data.volume ~/.config/containers/systemd/
cp deploy/env.example ~/.config/cardinal/env   # editar y completar los valores

# 3. Activar el servicio
systemctl --user daemon-reload
systemctl --user start cardinal
```

El contenedor publica en `127.0.0.1:8787` y persiste la DB en el volumen `cardinal-data` (`/data/cardinal.db`). Para exponerlo, usar `deploy/Caddyfile.example` como base en el Caddy del host (bloque `:8080` para local, o el bloque comentado de producción con el dominio).

## Scripts raíz

| Script | Descripción |
|--------|-------------|
| `bun run dev:backend` | Backend con watch en http://localhost:8787 |
| `bun run dev:frontend` | Vite dev server en http://localhost:5173 (proxy `/api` y `/ws` → 8787) |
| `bun run keygen -- ...` | CLI de API keys: `--agent <name>`, `--revoke <name>`, `--list` |
| `bun run build` | Build de producción del frontend → `frontend/dist/` |
| `bun test backend/src` | Suite de tests del backend |
