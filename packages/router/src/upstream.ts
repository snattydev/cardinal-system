export interface UpstreamBody {
  model: string;
  messages: unknown[];
  stream?: boolean;
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
}

export interface UpstreamResult {
  status: number;
  contentType: string;
  body: string | null;
  stream?: ReadableStream<Uint8Array>;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

const UPSTREAM_TIMEOUT_MS = 30_000;

export async function callUpstream(
  provider: { baseUrl: string },
  body: UpstreamBody,
  apiKey: string | null,
): Promise<UpstreamResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey !== null && apiKey.length > 0) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(chatCompletionsUrl(provider.baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  const contentType = response.headers.get("content-type") ?? "application/json";
  if (body.stream === true) {
    return {
      status: response.status,
      contentType,
      body: null,
      stream: response.body ?? undefined,
    };
  }

  return {
    status: response.status,
    contentType,
    body: await response.text(),
  };
}
