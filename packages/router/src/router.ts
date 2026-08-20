import type { Database } from "bun:sqlite";
import { consumeBudget, findActiveKeyByHash, logUsage } from "@cardinal/db";
import { RouterError } from "./error";
import { resolveModelChain, type ResolvedHop } from "./resolve";
import { callUpstream, type UpstreamBody, type UpstreamResult } from "./upstream";

export { RouterError } from "./error";

const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 3;
const providerCooldowns = new Map<string, number>();

export interface CompletionRequest {
  model: string;
  messages: unknown[];
  stream?: boolean;
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
}

export interface RouteOptions {
  decryptKey: (enc: string) => string;
}

export interface ProviderAttempt {
  provider: string;
  status: number | "timeout" | "skipped";
  error?: string;
}

function parseScopes(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function keyAllowsModel(scopesJson: string, model: string): boolean {
  const scopes = parseScopes(scopesJson);
  return scopes.includes("*") || scopes.includes(model);
}

function isCoolingDown(providerName: string, now: number): boolean {
  const until = providerCooldowns.get(providerName);
  if (until === undefined) return false;
  if (until <= now) {
    providerCooldowns.delete(providerName);
    return false;
  }
  return true;
}

function setCooldown(providerName: string, now: number): void {
  providerCooldowns.set(providerName, now + COOLDOWN_MS);
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
  const consumed = consumeBudget(db, keyHash, usage.totalTokens);
  if (!consumed) {
    db.run("UPDATE agent_keys SET revoked_at = datetime('now') WHERE key_hash = ? AND revoked_at IS NULL", [
      keyHash,
    ]);
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

function passthroughStream(
  upstream: ReadableStream<Uint8Array>,
  onComplete: (bytes: Uint8Array[]) => void,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const chunks: Uint8Array[] = [];
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        onComplete(chunks);
        controller.close();
        return;
      }
      chunks.push(value);
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function discardStream(stream: ReadableStream<Uint8Array> | undefined): Promise<void> {
  if (stream === undefined) return;
  try {
    await stream.cancel();
  } catch {
    // already closed
  }
}

function toUpstreamBody(request: CompletionRequest, modelId: string): UpstreamBody {
  const body: UpstreamBody = {
    model: modelId,
    messages: request.messages,
  };
  if (request.stream !== undefined) body.stream = request.stream;
  if (request.tools !== undefined) body.tools = request.tools;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
  return body;
}

export async function routeCompletion(
  db: Database,
  keyHash: string,
  request: CompletionRequest,
  options: RouteOptions,
): Promise<Response> {
  const key = findActiveKeyByHash(db, keyHash);
  if (key === null) throw new RouterError("unauthorized");
  if (!keyAllowsModel(key.scopes, request.model)) throw new RouterError("scope_denied");
  if (key.budget_limit !== null && key.budget_used >= key.budget_limit) {
    throw new RouterError("budget_exceeded");
  }

  const chain = await resolveModelChain(db, request.model);
  const attempts: ProviderAttempt[] = [];
  let calls = 0;

  for (const hop of chain) {
    if (calls >= MAX_ATTEMPTS) break;
    const now = Date.now();
    if (isCoolingDown(hop.providerName, now)) {
      attempts.push({ provider: hop.providerName, status: "skipped" });
      continue;
    }

    calls += 1;
    let result: UpstreamResult;
    try {
      result = await callUpstream(hop, toUpstreamBody(request, hop.modelId), decryptHopKey(hop, options.decryptKey));
    } catch (err) {
      setCooldown(hop.providerName, now);
      attempts.push({
        provider: hop.providerName,
        status: "timeout",
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (result.status >= 200 && result.status < 300) {
      if (request.stream === true) {
        const upstream = result.stream;
        if (upstream === undefined) {
          meterSuccess(db, keyHash, key.agent_name, hop, { promptTokens: 0, completionTokens: 1, totalTokens: 1 });
          return new Response(null, {
            status: result.status,
            headers: { "content-type": result.contentType },
          });
        }
        const stream = passthroughStream(upstream, (chunks) => {
          const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const decoder = new TextDecoder();
          let text = "";
          for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
          text += decoder.decode();
          const usage = parseUsage(text);
          const estimated =
            usage.totalTokens > 0
              ? usage
              : {
                  promptTokens: 0,
                  completionTokens: Math.max(1, Math.ceil(byteLength / 4)),
                  totalTokens: Math.max(1, Math.ceil(byteLength / 4)),
                };
          meterSuccess(db, keyHash, key.agent_name, hop, estimated);
        });
        return new Response(stream, {
          status: result.status,
          headers: { "content-type": result.contentType },
        });
      }

      const rawBody = result.body ?? "";
      const usage = parseUsage(rawBody);
      meterSuccess(db, keyHash, key.agent_name, hop, usage);
      return new Response(rewriteRequestedModel(rawBody, request.model), {
        status: result.status,
        headers: { "content-type": result.contentType },
      });
    }

    await discardStream(result.stream);
    if (result.status === 429 || result.status >= 500) {
      setCooldown(hop.providerName, now);
    }
    attempts.push({ provider: hop.providerName, status: result.status });
  }

  throw new RouterError("all_providers_failed", { attempts });
}
