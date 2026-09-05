export type AgentKind = "agent" | "subagent";

export interface AgentRow {
  name: string;
  device: string;
  kind: AgentKind;
  status: string;
  connected: number;
  last_seen: string | null;
  created_at: string;
  device_info: string | null;
}

export interface DeviceInfo {
  hostname?: string;
  platform?: string;
  arch?: string;
  gpu?: string;
  ram_gb?: number;
  ip?: string;
}

export interface DeviceRow {
  id: string;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  gpu: string | null;
  ram_gb: number | null;
  ip: string | null;
  last_seen: string | null;
  profiles: string[];
  agents: number;
}

export interface AgentKeyRow {
  id: number;
  key_hash: string;
  agent_name: string;
  kind_override: AgentKind | null;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  scopes: string;
  budget_limit: number | null;
  budget_used: number;
  expires_at: string | null;
  budget_usd_limit: number | null;
  budget_usd_used: number;
}

export type WireFormat = "openai" | "anthropic" | "gemini";
export type ProviderStatus = "active" | "disabled";

export interface ProviderRow {
  id: number;
  name: string;
  base_url: string;
  api_key_enc: string | null;
  wire_format: WireFormat;
  status: ProviderStatus;
  rpm_limit: number | null;
  tpm_limit: number | null;
  cost_per_mtok: number;
  created_at: string;
}

export interface ProviderModelRow {
  provider_id: number;
  model_id: string;
  capabilities: string;
  context_window: number | null;
}

export interface ModelRouteRow {
  alias: string;
  fallback_chain: string;
  created_at: string;
}

export interface UsageLogRow {
  id: number;
  agent_name: string | null;
  key_hash: string | null;
  provider_id: number | null;
  provider_name: string | null;
  model_id: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string;
}

export interface AgentEventRow {
  id: number;
  agent_name: string;
  type: "connect" | "disconnect" | "status";
  meta: string | null;
  at: string;
}

export type ProfileKind = "permanent" | "one-shot";
export type ProfileStatus = "active" | "dormant" | "liberated";

export interface ProfileRow {
  name: string;
  display_name: string | null;
  emoji: string | null;
  kind: ProfileKind;
  status: ProfileStatus;
  model_default: string | null;
  provider_default: string | null;
  device: string | null;
  last_onboarded: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SoulRow {
  profile_name: string;
  soul_md: string | null;
  personality_tags: string | null;
  tool_restrictions: string | null;
  canon_ref: string | null;
  version: number;
  updated_at: string | null;
}

export interface ConfigTemplateRow {
  profile_name: string;
  config_yaml: string | null;
  version: number;
  updated_at: string | null;
}

export interface SkillRow {
  name: string;
  description: string | null;
  category: string | null;
  content_hash: string | null;
  path: string | null;
  required_toolsets: string | null;
  updated_at: string | null;
}

export type MemoryTarget = "memory" | "user";
export type SyncDirection = "local_primary" | "cardinal_primary" | "bidirectional";

export interface MemoryMirrorRow {
  profile_name: string;
  target: MemoryTarget;
  content: string | null;
  char_count: number;
  content_hash: string | null;
  last_synced: string | null;
  sync_direction: SyncDirection;
}

export interface SessionRow {
  id: string;
  profile_name: string;
  title: string | null;
  model: string | null;
  started_at: number | null;
  message_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export type TaskStatus = "open" | "claimed" | "done" | "blocked";

export interface TaskRow {
  id: string;
  goal: string;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  parent_id: string | null;
  summary: string | null;
  artifact_ref: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface MessageRow {
  id: string;
  from_agent: string;
  to_agent: string;
  type: string;
  payload_ref: string | null;
  read: number;
  created_at: string;
}
