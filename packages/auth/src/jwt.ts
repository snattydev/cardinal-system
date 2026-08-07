import { SignJWT, jwtVerify } from "jose";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSession(
  secret: string,
  user: string,
  expiresIn = "12h",
): Promise<string> {
  return new SignJWT({ sub: user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret));
}

export async function verifySession(
  secret: string,
  token: string,
): Promise<{ user: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    return { user: payload.sub };
  } catch {
    return null;
  }
}
