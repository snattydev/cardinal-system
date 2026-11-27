const PROBE_TIMEOUT_MS = 10_000;

export class RouterProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterProbeError";
  }
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface RouterProbeConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}

export interface RouterProbeResult {
  modelCount: number;
}

export function routerProbeConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): RouterProbeConfig {
  return {
    baseUrl: env.CARDINAL_URL ?? "",
    apiKey: env.CARDINAL_KEY ?? "",
  };
}

export async function probeRouterModels(config: RouterProbeConfig): Promise<RouterProbeResult> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = config.apiKey.trim();
  if (baseUrl.length === 0 || apiKey.length === 0) {
    throw new RouterProbeError("CARDINAL_URL and CARDINAL_KEY are required");
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof RouterProbeError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new RouterProbeError(`router probe request failed: ${msg}`);
  }

  if (!response.ok) {
    throw new RouterProbeError(`router probe failed with status ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RouterProbeError("router probe returned invalid JSON");
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) {
    throw new RouterProbeError("router probe returned an unexpected body");
  }

  return { modelCount: (body as { data: unknown[] }).data.length };
}
