import type { Database } from "bun:sqlite";
import type { ServerWebSocket } from "bun";
import {
  findActiveKeyByHash,
  getAgent,
  insertEvent,
  listAgents,
  markAgentDisconnected,
  touchKey,
  updateAgentStatus,
  upsertAgentOnConnect,
} from "../db/repos";
import type { AgentRow } from "../db/repos";
import { hashKey, isKeyFormat } from "../keys/index";
import { parseClientMessage, resolveKind } from "./protocol";

export interface ConnData {
  dashboardAuthed: boolean;
  role: "agent" | "dashboard" | null;
  agentName: string | null;
}

export interface AgentPayload {
  name: string;
  device: string;
  kind: string;
  status: string;
  connected: boolean;
  lastSeen: string | null;
}

export function agentToPayload(row: AgentRow): AgentPayload {
  return {
    name: row.name,
    device: row.device,
    kind: row.kind,
    status: row.status,
    connected: row.connected === 1,
    lastSeen: row.last_seen,
  };
}

type WS = ServerWebSocket<ConnData>;
type Timer = ReturnType<typeof setInterval>;

export class Hub {
  private agents = new Map<string, WS>();
  private timers = new Map<string, Timer>();
  private missed = new Map<string, number>();
  private dashboards = new Set<WS>();

  constructor(
    private db: Database,
    private opts: { pingIntervalMs: number },
  ) {}

  readonly websocket = {
    message: (ws: WS, raw: string | Buffer): void => this.onMessage(ws, raw),
    close: (ws: WS): void => this.onClose(ws),
  };

  dispose(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.agents.clear();
    this.missed.clear();
    this.dashboards.clear();
  }

  private onMessage(ws: WS, raw: string | Buffer): void {
    const parsed = parseClientMessage(typeof raw === "string" ? raw : raw.toString());
    if (!parsed.ok) {
      this.fail(ws, 4400, "invalid_message");
      return;
    }
    const msg = parsed.msg;
    if (ws.data.role !== null && msg.type !== "pong" && msg.type !== "bye") {
      this.send(ws, { type: "error", reason: "already_identified" });
      return;
    }
    switch (msg.type) {
      case "hello":
        this.onHello(ws, msg.key, msg.device, msg.status);
        break;
      case "subscribe":
        this.onSubscribe(ws);
        break;
      case "pong":
        this.onPong(ws, msg.status);
        break;
      case "bye":
        this.onBye(ws);
        break;
    }
  }

  private onHello(ws: WS, key: string, device: string, status: "idle" | "busy"): void {
    if (!isKeyFormat(key)) {
      this.fail(ws, 4401, "auth_failed");
      return;
    }
    const keyRow = findActiveKeyByHash(this.db, hashKey(key));
    if (!keyRow) {
      this.fail(ws, 4401, "auth_failed");
      return;
    }
    touchKey(this.db, keyRow.id);

    const name = keyRow.agent_name;
    const kind = resolveKind(device, keyRow.kind_override);

    const previous = this.agents.get(name);
    if (previous) {
      this.teardownAgent(name);
      previous.close(4000, "replaced");
    }

    ws.data.role = "agent";
    ws.data.agentName = name;
    this.agents.set(name, ws);
    this.missed.set(name, 0);

    upsertAgentOnConnect(this.db, { name, device, kind, status });
    insertEvent(this.db, { agentName: name, type: "connect", meta: device });

    this.send(ws, { type: "welcome", agent: name, kind });
    this.broadcastAgent(name);
    this.startPing(name);
  }

  private onSubscribe(ws: WS): void {
    if (!ws.data.dashboardAuthed) {
      this.fail(ws, 4401, "auth_failed");
      return;
    }
    ws.data.role = "dashboard";
    this.dashboards.add(ws);
    this.send(ws, { type: "roster", agents: listAgents(this.db).map(agentToPayload) });
  }

  private onPong(ws: WS, status: "idle" | "busy" | undefined): void {
    if (ws.data.role !== "agent" || ws.data.agentName === null) return;
    const name = ws.data.agentName;
    this.missed.set(name, 0);

    const current = getAgent(this.db, name)?.status ?? "idle";
    const next = status ?? current;
    updateAgentStatus(this.db, name, next);
    if (next !== current) {
      insertEvent(this.db, { agentName: name, type: "status", meta: next });
      this.broadcastAgent(name);
    }
  }

  private onBye(ws: WS): void {
    if (ws.data.role !== "agent" || ws.data.agentName === null) return;
    this.disconnectAgent(ws.data.agentName);
    ws.close(1000, "bye");
  }

  private onClose(ws: WS): void {
    if (ws.data.role === "dashboard") {
      this.dashboards.delete(ws);
      return;
    }
    if (ws.data.role !== "agent" || ws.data.agentName === null) return;
    if (this.agents.get(ws.data.agentName) === ws) {
      this.disconnectAgent(ws.data.agentName);
    }
  }

  private disconnectAgent(name: string): void {
    this.teardownAgent(name);
    markAgentDisconnected(this.db, name);
    insertEvent(this.db, { agentName: name, type: "disconnect" });
    this.broadcastAgent(name);
  }

  private teardownAgent(name: string): void {
    const timer = this.timers.get(name);
    if (timer !== undefined) clearInterval(timer);
    this.timers.delete(name);
    this.missed.delete(name);
    this.agents.delete(name);
  }

  private startPing(name: string): void {
    const timer = setInterval(() => {
      const ws = this.agents.get(name);
      if (!ws) return;
      const count = (this.missed.get(name) ?? 0) + 1;
      this.missed.set(name, count);
      if (count >= 2) {
        this.disconnectAgent(name);
        ws.close(4000, "ping_timeout");
      } else {
        this.send(ws, { type: "ping" });
      }
    }, this.opts.pingIntervalMs);
    this.timers.set(name, timer);
  }

  private broadcastAgent(name: string): void {
    const row = getAgent(this.db, name);
    if (!row) return;
    const payload = JSON.stringify({ type: "agent_update", agent: agentToPayload(row) });
    for (const dash of this.dashboards) dash.send(payload);
  }

  private send(ws: WS, data: unknown): void {
    ws.send(JSON.stringify(data));
  }

  private fail(ws: WS, code: number, reason: string): void {
    this.send(ws, { type: "error", reason });
    ws.close(code, reason);
  }
}
