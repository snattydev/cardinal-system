import type { Database } from "bun:sqlite";
import type { AgentKeyRow, ProviderRow } from "@cardinal/db";
import {
  consumeBudget,
  consumeBudgetUsd,
  findActiveKeyByHash,
  getModelRoute,
  getProviderByName,
  logUsage,
} from "@cardinal/db";
import { RouterError } from "./error";
import { resolveModelChain, type ResolvedHop } from "./resolve";
import { callUpstream, type UpstreamBody } from "./upstream";

interface FusionRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
}

interface FusionOptions {
  decryptKey: (enc: string) => string;
}

interface ProviderAttempt {
  provider: string;
  status: number | "timeout" | "skipped";
  error?: string;
}

interface FusionHop {
  provider: string;
  model: string;
}

interface FusionConfig {
  mode: "fusion";
  panel: Array<FusionHop | string>;
  judge: FusionHop | string;
  strategy?: "synthesize" | "best_of";
}

interface DraftResult {
  hop: ResolvedHop;
  rawBody: string;
  content: string;
}

function isUsableProvider(provider: ProviderRow): boolean {
  return provider.status === "active" && provider.base_url.length > 0;
}

function toHop(provider: ProviderRow, modelId: string): ResolvedHop {
  return {
    providerId: provider.id,
    providerName: provider.name,
    baseUrl: provider.base_url,
    apiKeyEnc: provider.api_key_enc,
    wireFormat: provider.wire_format,
    modelId,
    costPerMtok: provider.cost_per_mtok ?? 0,
  };
}

function parseHopOrString(item: unknown): FusionHop | string | null {
  if (typeof item === "string" && item.length > 0) return item;
  if (typeof item !== "object" || item === null) return null;
  const hop = item as Record<string, unknown>;
  if (typeof hop.provider !== "string" || hop.provider.length === 0) return null;
  if (typeof hop.model !== "string" || hop.model.length === 0) return null;
  return { provider: hop.provider, model: hop.model };
}

function parseFusionConfig(raw: string): FusionConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.mode !== "fusion") return null;
  if (!Array.isArray(obj.panel) || obj.panel.length === 0) return null;
  const panel: Array<FusionHop | string> = [];
  for (const item of obj.panel) {
    const slot = parseHopOrString(item);
    if (slot === null) return null;
    panel.push(slot);
  }
  const judge = parseHopOrString(obj.judge);
  if (judge === null) return null;
  const config: FusionConfig = { mode: "fusion", panel, judge };
  if (obj.strategy === "best_of" || obj.strategy === "synthesize") {
    config.strategy = obj.strategy;
  }
  return config;
}

function parseUsage(body: string): { promptTokens: number; completionTokens: number; totalTokens: number } {
  try {
    const json = JSON.parse(body) as {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    const prompt = typeof json.usage?.prompt_tokens === "number" ? json.usage.prompt_tokens : 0;
    const completion = typeof json.usage?.completion_tokens === "number" ? json.usage.completion_tokens : 0;
    const listed = typeof json.usage?.total_tokens === "number" ? json.usage.total_tokens : prompt + completion;
    if (listed > 0) {
      return { promptTokens: prompt, completionTokens: completion, totalTokens: listed };
    }
  } catch {
    // fall through to length estimate
  }
  const estimated = Math.max(1, Math.ceil(body.length / 4));
  return { promptTokens: 0, completionTokens: estimated, totalTokens: estimated };
}

function rewriteRequestedModel(body: string, model: string): string {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    json.model = model;
    return JSON.stringify(json);
  } catch {
    return body;
  }
}

function decryptHopKey(hop: ResolvedHop, decryptKey: (enc: string) => string): string | null {
  if (hop.apiKeyEnc === null) return null;
  return decryptKey(hop.apiKeyEnc);
}

function meterSuccess(
  db: Database,
  keyHash: string,
  agentName: string,
  hop: ResolvedHop,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
): void {
  const usdLimit = findActiveKeyByHash(db, keyHash)?.budget_usd_limit ?? null;
  const consumed = consumeBudget(db, keyHash, usage.totalTokens);
  if (!consumed) {
    db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE key_hash = ? AND revoked_at IS NULL", [
      keyHash,
    ]);
  }
  if (usdLimit !== null) {
    const usdConsumed = consumeBudgetUsd(db, keyHash, (usage.totalTokens / 1e6) * hop.costPerMtok);
    if (!usdConsumed) {
      db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE key_hash = ? AND revoked_at IS NULL", [
        keyHash,
      ]);
    }
  }
  logUsage(db, {
    agentName,
    keyHash,
    providerId: hop.providerId,
    providerName: hop.providerName,
    modelId: hop.modelId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  });
}

function toUpstreamBody(request: FusionRequest, modelId: string, messages: unknown[]): UpstreamBody {
  const body: UpstreamBody = {
    model: modelId,
    messages,
    stream: false,
  };
  if (request.tools !== undefined) body.tools = request.tools;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
  return body;
}

function extractDraft(body: string): string | null {
  try {
    const json = JSON.parse(body) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

function buildJudgeMessages(original: unknown[], drafts: DraftResult[]): unknown[] {
  const listed = drafts
    .map((draft) => `${draft.hop.providerName}/${draft.hop.modelId}:\n${draft.content}`)
    .join("\n\n");
  return [
    ...original,
    {
      role: "user",
      content: `Synthesize a single answer from these proposer drafts:\n\n${listed}`,
    },
  ];
}

async function resolveSlot(db: Database, slot: FusionHop | string): Promise<ResolvedHop | null> {
  if (typeof slot === "string") {
    try {
      const chain = await resolveModelChain(db, slot);
      return chain[0] ?? null;
    } catch (err) {
      if (err instanceof RouterError && err.code === "model_not_found") return null;
      throw err;
    }
  }
  const provider = getProviderByName(db, slot.provider);
  if (provider === null || !isUsableProvider(provider)) return null;
  return toHop(provider, slot.model);
}

export function shouldRunFusion(db: Database, model: string): boolean {
  if (model === "fusion") return true;
  const route = getModelRoute(db, model);
  if (route === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(route.fallback_chain);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  return (parsed as Record<string, unknown>).mode === "fusion";
}

export async function runFusion(
  db: Database,
  key: AgentKeyRow,
  keyHash: string,
  request: FusionRequest,
  options: FusionOptions,
): Promise<Response> {
  const route = getModelRoute(db, request.model);
  const config = route === null ? null : parseFusionConfig(route.fallback_chain);
  if (config === null) throw new RouterError("fusion_not_configured");
  if (request.stream === true) throw new RouterError("fusion_streaming_unsupported");
  if (config.strategy === "best_of") throw new RouterError("fusion_strategy_unsupported");

  const hops: ResolvedHop[] = [];
  for (const slot of config.panel) {
    const hop = await resolveSlot(db, slot);
    if (hop !== null) hops.push(hop);
  }

  const judgeHop = await resolveSlot(db, config.judge);
  if (judgeHop === null) throw new RouterError("fusion_not_configured");

  const settled = await Promise.allSettled(
    hops.map(async (hop): Promise<{ draft: DraftResult } | { attempt: ProviderAttempt }> => {
      try {
        const result = await callUpstream(
          hop,
          toUpstreamBody(request, hop.modelId, request.messages),
          decryptHopKey(hop, options.decryptKey),
        );
        if (result.status >= 200 && result.status < 300) {
          const rawBody = result.body ?? "";
          const content = extractDraft(rawBody);
          if (content !== null) {
            return { draft: { hop, rawBody, content } };
          }
        }
        return { attempt: { provider: hop.providerName, status: result.status } };
      } catch (err) {
        return {
          attempt: {
            provider: hop.providerName,
            status: "timeout",
            error: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }),
  );

  const drafts: DraftResult[] = [];
  const attempts: ProviderAttempt[] = [];
  for (const item of settled) {
    if (item.status === "rejected") {
      attempts.push({ provider: "unknown", status: "timeout", error: String(item.reason) });
      continue;
    }
    if ("draft" in item.value) {
      drafts.push(item.value.draft);
    } else {
      attempts.push(item.value.attempt);
    }
  }

  if (drafts.length === 0) {
    throw new RouterError("all_providers_failed", { attempts });
  }

  for (const draft of drafts) {
    meterSuccess(db, keyHash, key.agent_name, draft.hop, parseUsage(draft.rawBody));
  }
  if (findActiveKeyByHash(db, keyHash) === null) {
    throw new RouterError("budget_exceeded");
  }

  let judgeResult;
  try {
    judgeResult = await callUpstream(
      judgeHop,
      toUpstreamBody(request, judgeHop.modelId, buildJudgeMessages(request.messages, drafts)),
      decryptHopKey(judgeHop, options.decryptKey),
    );
  } catch (err) {
    attempts.push({
      provider: judgeHop.providerName,
      status: "timeout",
      error: err instanceof Error ? err.message : String(err),
    });
    throw new RouterError("all_providers_failed", { attempts });
  }

  if (judgeResult.status < 200 || judgeResult.status >= 300) {
    attempts.push({ provider: judgeHop.providerName, status: judgeResult.status });
    throw new RouterError("all_providers_failed", { attempts });
  }

  const rawBody = judgeResult.body ?? "";
  meterSuccess(db, keyHash, key.agent_name, judgeHop, parseUsage(rawBody));
  return new Response(rewriteRequestedModel(rawBody, request.model), {
    status: judgeResult.status,
    headers: { "content-type": judgeResult.contentType || "application/json" },
  });
}
