import { beforeAll, describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import type { Config } from "@cardinal/core";
import { signSession, verifySession } from "./jwt";
import { clearSessionCookie, readCookie, sessionCookie } from "./session";
import { LoginRateLimiter } from "./rate-limit";
import { handleLogin, handleLogout, handleMe } from "./routes";

describe("jwt", () => {
  test("signSession/verifySession roundtrip returns the user", async () => {
    const token = await signSession("s1", "admin");
    expect(await verifySession("s1", token)).toEqual({ user: "admin" });
  });

  test("wrong secret returns null", async () => {
    const token = await signSession("s1", "admin");
    expect(await verifySession("other-secret", token)).toBeNull();
  });

  test("expired token returns null", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(new TextEncoder().encode("s1"));
    expect(await verifySession("s1", token)).toBeNull();
  });

  test("token without sub returns null", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("s1"));
    expect(await verifySession("s1", token)).toBeNull();
  });
});

describe("session", () => {
  test("sessionCookie contains name and security flags", () => {
    const c = sessionCookie("tok");
    expect(c).toContain("cardinal_session=");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    expect(c).toContain("Max-Age=43200");
  });

  test("clearSessionCookie expires immediately", () => {
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  test("readCookie parses the requested cookie", () => {
    expect(readCookie("a=1; cardinal_session=tok123; b=2", "cardinal_session")).toBe("tok123");
  });

  test("readCookie returns null when missing", () => {
    expect(readCookie("a=1; b=2", "cardinal_session")).toBeNull();
  });

  test("readCookie returns null for null header", () => {
    expect(readCookie(null, "cardinal_session")).toBeNull();
  });
});

describe("routes", () => {
  let config: Config;

  beforeAll(async () => {
    config = {
      port: 0,
      dbPath: ":memory:",
      adminUser: "admin",
      adminPasswordHash: await Bun.password.hash("sao123"),
      jwtSecret: "test-secret",
      poolSecret: "test-pool-secret",
      staticDir: "x",
      pingIntervalMs: 1000,
    };
  });

  function loginReq(body: string, headers?: HeadersInit): Request {
    return new Request("http://t/api/auth/login", { method: "POST", body, headers });
  }

  test("handleLogin: correct credentials return 200 and set-cookie", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
      config,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "admin" });
    expect(res.headers.get("set-cookie")).toContain("cardinal_session=");
  });

  test("handleLogin: default set-cookie has no Secure", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
      config,
    );
    expect(res.headers.get("set-cookie")).not.toContain("Secure");
  });

  test("handleLogin: NODE_ENV production adds Secure", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await handleLogin(
        loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
        config,
      );
      expect(res.headers.get("set-cookie")).toContain("Secure");
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });

  test("handleLogin: X-Forwarded-Proto https adds Secure", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" }), {
        "X-Forwarded-Proto": "https",
      }),
      config,
    );
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  test("handleLogin: wrong password returns 401", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "nope" })),
      config,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  test("handleLogin: wrong user returns 401", async () => {
    const res = await handleLogin(
      loginReq(JSON.stringify({ user: "root", password: "sao123" })),
      config,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  test("handleLogin: invalid JSON body returns 400", async () => {
    const res = await handleLogin(loginReq("not-json"), config);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
  });

  test("handleMe: with session cookie returns 200", async () => {
    const login = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
      config,
    );
    const cookie = login.headers.get("set-cookie")!;
    const req = new Request("http://t/api/auth/me", { headers: { cookie } });
    const res = await handleMe(req, config);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "admin" });
  });

  test("handleMe: without cookie returns 401", async () => {
    const res = await handleMe(new Request("http://t/api/auth/me"), config);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("handleLogout: clears the session cookie", () => {
    const res = handleLogout();
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("handleLogout: X-Forwarded-Proto https adds Secure", () => {
    const req = new Request("http://t/api/auth/logout", {
      method: "POST",
      headers: { "X-Forwarded-Proto": "https" },
    });
    const res = handleLogout(req);
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  test("handleLogin: enforces LoginRateLimiter after maxFailures and resets on valid login", async () => {
    let now = 1_000;
    const limiter = new LoginRateLimiter({ maxFailures: 3, windowMs: 60_000, now: () => now });
    const opts = { rateLimiter: limiter, clientKey: "10.0.0.1" };

    for (let i = 0; i < 3; i += 1) {
      const bad = await handleLogin(
        loginReq(JSON.stringify({ user: "admin", password: "wrong" })),
        config,
        opts,
      );
      expect(bad.status).toBe(401);
    }

    const blocked = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
      config,
      opts,
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "too_many_requests" });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

    now += 60_001;
    const ok = await handleLogin(
      loginReq(JSON.stringify({ user: "admin", password: "sao123" })),
      config,
      opts,
    );
    expect(ok.status).toBe(200);
  });
});

describe("LoginRateLimiter", () => {
  test("blocks after maxFailures, resets after windowMs or reset(), and caps maxEntries", () => {
    let now = 0;
    const limiter = new LoginRateLimiter({
      maxFailures: 2,
      windowMs: 10_000,
      maxEntries: 2,
      now: () => now,
    });

    expect(limiter.check("ip1")).toEqual({ allowed: true, retryAfterSec: 0 });
    limiter.recordFailure("ip1");
    expect(limiter.check("ip1").allowed).toBe(true);
    limiter.recordFailure("ip1");
    expect(limiter.check("ip1")).toEqual({ allowed: false, retryAfterSec: 10 });

    limiter.reset("ip1");
    expect(limiter.check("ip1").allowed).toBe(true);

    limiter.recordFailure("ip1");
    limiter.recordFailure("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);
    now += 5_000;
    expect(limiter.check("ip1")).toEqual({ allowed: false, retryAfterSec: 5 });
    now += 5_000;
    expect(limiter.check("ip1").allowed).toBe(true);

    limiter.recordFailure("a");
    limiter.recordFailure("b");
    limiter.recordFailure("c");
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});
