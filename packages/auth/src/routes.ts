import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import { signSession } from "./jwt";
import { clearSessionCookie, getSessionUser, sessionCookie } from "./session";

export async function handleLogin(req: Request, config: Config): Promise<Response> {
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
    return json({ error: "invalid_credentials" }, 401);
  }
  const token = await signSession(config.jwtSecret, config.adminUser);
  return json({ user: config.adminUser }, 200, { "set-cookie": sessionCookie(token) });
}

export function handleLogout(): Response {
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

export async function handleMe(req: Request, config: Config): Promise<Response> {
  const user = await getSessionUser(req, config.jwtSecret);
  if (!user) return json({ error: "unauthorized" }, 401);
  return json({ user });
}
