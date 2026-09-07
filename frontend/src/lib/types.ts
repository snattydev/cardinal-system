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
  | { type: "agent_update"; agent: AgentPayload }
  | { type: "task_update"; task: TaskPayload };

/** Wire shape from WS `task_update` (camelCase). REST `/api/tasks` is snake_case. */
export interface TaskPayload {
  id: string;
  goal: string;
  status: "open" | "claimed" | "done" | "blocked";
  assignedTo: string | null;
  createdBy: string;
  parentId: string | null;
  summary: string | null;
  artifactRef: string | null;
  createdAt: string;
  updatedAt: string | null;
}

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

/** Raw shape from GET /api/keys, POST /api/keys, and POST /api/keys/:id/revoke */
export interface KeyItem {
  id: number;
  agentName: string;
  createdBy: string;
  scopes: string[];
  budgetLimit: number | null;
  budgetUsed: number;
  expiresAt: string | null;
  budgetUsdLimit: number | null;
  budgetUsdUsed: number;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Raw shape from GET /api/router/providers */
export interface RouterProvider {
  id: number;
  name: string;
  base_url: string;
  wire_format: "openai" | "anthropic" | "gemini";
  status: "active" | "disabled";
  rpm_limit: number | null;
  tpm_limit: number | null;
  cost_per_mtok: number;
  created_at: string;
}

export interface RouterModel {
  provider_id: number;
  model_id: string;
  capabilities: string;
  context_window: number | null;
}

/** Raw shape from GET /api/router/routes */
export interface RouterHop {
  provider: string;
  model: string;
}

export interface RouterRoute {
  alias: string;
  fallback_chain: RouterHop[];
  created_at: string;
}

/** Raw shape from GET /api/router/catalog */
export type RouterCatalogKind = "model" | "alias" | "fusion";

export interface RouterCatalogItem {
  id: string;
  kind: RouterCatalogKind;
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
