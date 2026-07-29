import { verifySession } from "./jwt";

export const SESSION_COOKIE = "cardinal_session";
export const SESSION_MAX_AGE = 43200;

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      const value = rest.join("=");
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export async function getSessionUser(req: Request, jwtSecret: string): Promise<string | null> {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  const session = await verifySession(jwtSecret, token);
  return session?.user ?? null;
}
