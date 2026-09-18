import type { WireFormat } from "@cardinal/core";

const UPSTREAM_TIMEOUT_MS = 30_000;
const ANTHROPIC_VERSION = "2023-06-01";

export class ModelFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ModelFetchError";
  }
}

export function modelsUrl(baseUrl: string, wireFormat: WireFormat): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (wireFormat === "gemini") {
    if (trimmed.endsWith("/v1beta")) return `${trimmed}/models`;
    if (trimmed.endsWith("/v1")) return `${trimmed}/models`;
    return `${trimmed}/v1beta/models`;
  }
  if (trimmed.endsWith("/v1")) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
}

function parseOpenAIModels(body: unknown): string[] {
  if (body === null || typeof body !== "object") throw new ModelFetchError("invalid_response");
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) throw new ModelFetchError("invalid_response");
  const ids: string[] = [];
  for (const item of data) {
    if (item !== null && typeof item === "object") {
      const id = (item as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
  }
  return ids;
}

function parseGeminiModels(body: unknown): string[] {
  if (body === null || typeof body !== "object") throw new ModelFetchError("invalid_response");
  const models = (body as { models?: unknown }).models;
  if (!Array.isArray(models)) throw new ModelFetchError("invalid_response");
  const ids: string[] = [];
  for (const item of models) {
    if (item !== null && typeof item === "object") {
      const name = (item as { name?: unknown }).name;
      if (typeof name === "string" && name.length > 0) {
        ids.push(name.replace(/^models\//, ""));
      }
    }
  }
  return ids;
}

export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string | null,
  wireFormat: WireFormat,
): Promise<string[]> {
  let fetchUrl = modelsUrl(baseUrl, wireFormat);
  const headers: Record<string, string> = {};

  if (wireFormat === "anthropic") {
    if (apiKey !== null && apiKey.length > 0) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = ANTHROPIC_VERSION;
    }
  } else if (wireFormat === "gemini") {
    if (apiKey !== null && apiKey.length > 0) {
      const sep = fetchUrl.includes("?") ? "&" : "?";
      fetchUrl = `${fetchUrl}${sep}key=${encodeURIComponent(apiKey)}`;
    }
  } else if (apiKey !== null && apiKey.length > 0) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(fetchUrl, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new ModelFetchError(`upstream ${response.status}`, response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ModelFetchError("invalid_response");
  }

  const ids = wireFormat === "gemini" ? parseGeminiModels(body) : parseOpenAIModels(body);
  return [...new Set(ids)].sort();
}
