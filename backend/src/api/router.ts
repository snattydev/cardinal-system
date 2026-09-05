import type { Database } from "bun:sqlite";
import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import { listModelRoutes, listProviderModels, listProviders } from "@cardinal/db";
import { decryptSecret, hashKey, isKeyFormat } from "@cardinal/keys";
import { routeCompletion, RouterError, type CompletionRequest } from "@cardinal/router";

export function extractBearerKey(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (match === null) return null;
  const key = match[1]!;
  return isKeyFormat(key) ? key : null;
}

function toCompletionRequest(body: unknown): CompletionRequest {
  const raw = (body ?? {}) as Record<string, unknown>;
  const request: CompletionRequest = {
    model: typeof raw.model === "string" ? raw.model : "",
    messages: Array.isArray(raw.messages) ? raw.messages : [],
  };
  if (typeof raw.stream === "boolean") request.stream = raw.stream;
  if (Array.isArray(raw.tools)) request.tools = raw.tools;
  if (typeof raw.temperature === "number") request.temperature = raw.temperature;
  if (typeof raw.max_tokens === "number") request.max_tokens = raw.max_tokens;
  return request;
}

function routerErrorResponse(err: RouterError): Response {
  switch (err.code) {
    case "unauthorized":
      return json({ error: "unauthorized" }, 401);
    case "scope_denied":
      return json({ error: "scope_denied" }, 403);
    case "budget_exceeded":
      return json({ error: "budget_exceeded" }, 402);
    case "model_not_found":
      return json({ error: "model_not_found" }, 404);
    case "fusion_not_configured":
      return json({ error: "fusion_not_configured" }, 400);
    case "fusion_streaming_unsupported":
      return json({ error: "fusion_streaming_unsupported" }, 400);
    case "fusion_strategy_unsupported":
      return json({ error: "fusion_strategy_unsupported" }, 501);
    case "all_providers_failed":
      return json({ error: "all_providers_failed", details: err.details }, 502);
    default:
      return json({ error: err.code }, 500);
  }
}

export async function handleChatCompletions(
  req: Request,
  db: Database,
  config: Config,
): Promise<Response> {
  const key = extractBearerKey(req);
  if (key === null) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  try {
    return await routeCompletion(db, hashKey(key), toCompletionRequest(body), {
      decryptKey: (enc) => decryptSecret(enc, config.poolSecret),
    });
  } catch (err) {
    if (err instanceof RouterError) return routerErrorResponse(err);
    throw err;
  }
}

interface ListedModel {
  id: string;
  object: "model";
  owned_by: string;
}

export function handleListModels(db: Database): Response {
  const data: ListedModel[] = [];
  const seen = new Set<string>();

  for (const provider of listProviders(db)) {
    if (provider.status !== "active") continue;
    for (const model of listProviderModels(db, provider.id)) {
      if (seen.has(model.model_id)) continue;
      seen.add(model.model_id);
      data.push({ id: model.model_id, object: "model", owned_by: provider.name });
    }
  }

  for (const route of listModelRoutes(db)) {
    if (seen.has(route.alias)) continue;
    seen.add(route.alias);
    data.push({ id: route.alias, object: "model", owned_by: "cardinal" });
  }

  return json({ object: "list", data });
}
