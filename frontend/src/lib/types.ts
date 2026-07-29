export interface AgentPayload {
  name: string;
  device: string;
  kind: "agent" | "subagent";
  status: string;
  connected: boolean;
  lastSeen: string | null;
}

export interface AgentEvent {
  id: number;
  agent_name: string;
  type: "connect" | "disconnect" | "status";
  meta: string | null;
  at: string;
}

export type ServerEvent =
  | { type: "roster"; agents: AgentPayload[] }
  | { type: "agent_update"; agent: AgentPayload };

/** Raw shape from GET /api/system */
export interface SystemInfo {
  version: string;
  uptime_seconds: number;
  db_size_bytes: number;
  agents_total: number;
  agents_online: number;
  keys_active: number;
  keys_revoked: number;
}

export function fmtUptime(s: number): string {
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.floor(s % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
