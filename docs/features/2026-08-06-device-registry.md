# Device Registry — Fase 1.8.1 + 1.8.2

**Date:** 2026-08-06
**Phase:** Fase 1 — Context Store (Device Registry)

## What

Se implementó el Device Registry mínimo sobre la tabla `agents` existente:

- **1.8.1** — Migración 8: `ALTER TABLE agents ADD COLUMN device_info TEXT;` guarda el JSON de info del dispositivo por agente.
- **1.8.2** — API `GET /api/devices` (lista deduplicada de dispositivos) + `POST /api/devices/heartbeat` (agente reporta su device), y broadcast WS `devices_update` a dashboards al conectar/desconectar un agente.

## Why

El spec del Context Store (sección 3.7) define el Device Registry con campos `id, hostname, platform, arch, gpu, ram_gb, last_seen, ip, profiles`. Los agentes no envían esta info en el `hello` del WS (protocolo no se toca); en su lugar la reportan por HTTP heartbeat. El dashboard necesita ver los dispositivos físicos deduplicados y recibir updates en real-time cuando un agente conecta o desconecta.

## Decisions

### `device_info` como JSON en `agents` (no tabla `devices` separada)

El spec original planteaba tablas `devices` + `device_profiles`. Para esta fase se eligió extender `agents` con `device_info TEXT` (JSON) por simplicidad y coherencia con el patrón existente del repo (todo en una fila por agente). `listDevices` deduplica agrupando por `hostname` (fallback: `agents.device`) y devuelve `count` de agentes por dispositivo + `profiles` (nombres de agentes). No se crea tabla nueva → no hay que migrar datos existentes.

### Heartbeat HTTP, no cambio de protocolo WS

El spec de la tarea exige explícitamente "Do NOT change the hello/pong protocol or existing message types". El device info viaja por `POST /api/devices/heartbeat` con body `{agent, info}`. El WS solo reacciona: emite `devices_update` (payload = `listDevices`) en `onHello` y en `disconnectAgent`.

### `updateAgentDeviceInfo` bupea `device` desde `hostname`

Si `info.hostname` viene, se actualiza también `agents.device` a ese valor (el device pasa a ser el host físico). Siempre refresca `last_seen`.

### Rutas con JWT auth

Ambos endpoints pasan por `getSessionUser` (cookie de sesión), mismo patrón que el resto de `/api/*`.

## Alternatives Considered

- **Tabla `devices` + `device_profiles` del spec original:** más normalizado, pero agrega una tabla y FKs para un dataset que hoy es 1:1 agente↔device. Se difiere a Fase 2+ si hace falta multi-profile por device.
- **Enviar device_info en el `hello` WS:** rompe el protocolo existente y el spec de la tarea lo prohíbe.

## Files Created

```
backend/src/api/devices.ts         ← handleListDevices + handleDeviceHeartbeat
```

## Files Modified

```
packages/db/src/schema.ts          ← migración 8: device_info TEXT
packages/core/src/types.ts         ← AgentRow.device_info + tipos DeviceInfo/DeviceRow
packages/core/src/index.ts         ← export de DeviceInfo/DeviceRow
packages/db/src/repos.ts           ← updateAgentDeviceInfo + listDevices
packages/db/src/index.ts           ← exports nuevos
backend/src/server.ts              ← rutas GET /api/devices + POST /api/devices/heartbeat (JWT)
packages/ws/src/hub.ts             ← broadcastDevices() + llamadas en hello/disconnect

packages/db/src/db.test.ts         ← tests migración 8 + repos devices
packages/ws/src/hub.test.ts        ← tests devices_update + ajuste test bye
backend/src/api/api.test.ts        ← tests handlers devices
backend/src/server.test.ts         ← tests rutas devices (auth + heartbeat)
```

## Test Results

TDD estricto: RED confirmado (7 tests fallando por features ausentes: `Cannot find module './devices'`, `Export named 'listDevices' not found`, rutas 404, `devices_update` no emitido) → GREEN final:

```
195 pass
 0 fail
572 expect() calls
Ran 195 tests across 10 files.
```

Backend typecheck: `bun x tsc --noEmit -p backend/tsconfig.json` → exit 0.

## Security Note

Se tocó `packages/ws/src/hub.ts` → según AGENTS.md se requiere **Security Review** antes de mergear a `main` (cambios en protocolo WS / broadcast).
