import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import { signSession } from "./jwt";
import type { LoginRateLimiter } from "./rate-limit";
import { clearSessionCookie, cookieSecure, getSessionUser, sessionCookie } from "./session";

export interface HandleLoginOptions {
  rateLimiter?: LoginRateLimiter;
  clientKey?: string;
}

export async function handleLogin(
  req: Request,
  config: Config,
  opts?: HandleLoginOptions,
): Promise<Response> {
  const limiter = opts?.rateLimiter;
  const clientKey = opts?.clientKey ?? "default";
  if (limiter) {
    const limit = limiter.check(clientKey);
    if (!limit.allowed) {
      return json({ error: "too_many_requests" }, 429, {
        "retry-after": String(limit.retryAfterSec),
      });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const { user, password } = (body ?? {}) as { user?: unknown; password?: unknown };
  const passwordOk =
    typeof password === "string" &&
    (await Bun.password.verify(password, config.adminPasswordHash).catch(() => false));
  if (user !== config.adminUser || !passwordOk) {
    limiter?.recordFailure(clientKey);
    return json({ error: "invalid_credentials" }, 401);
  }
  limiter?.reset(clientKey);
  const token = await signSession(config.jwtSecret, config.adminUser);
  const secure = cookieSecure(req);
  return json({ user: config.adminUser }, 200, { "set-cookie": sessionCookie(token, secure) });
}

export function handleLogout(req?: Request): Response {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(cookieSecure(req)) });
}

export async function handleMe(req: Request, config: Config): Promise<Response> {
  const user = await getSessionUser(req, config.jwtSecret);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ user });
}
