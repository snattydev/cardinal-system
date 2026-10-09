import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveStatic } from "./static";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cardinal-static-"));
  writeFileSync(join(dir, "index.html"), "<h1>cardinal</h1>");
  writeFileSync(join(dir, "app.js"), "console.log(1)");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function get(path: string, staticDir = dir): Promise<Response> {
  return serveStatic(new Request(`http://localhost${path}`), staticDir);
}

test("serves an existing file by path", async () => {
  const res = await get("/app.js");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("console.log(1)");
});

test("SPA fallback serves index.html for unknown routes", async () => {
  const res = await get("/some/spa/route");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(await res.text()).toBe("<h1>cardinal</h1>");
});

test("GET / serves index.html", async () => {
  const res = await get("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("<h1>cardinal</h1>");
});

test("returns 404 when staticDir does not exist", async () => {
  const res = await get("/app.js", "/nonexistent-cardinal-static-dir");
  expect(res.status).toBe(404);
});

test("path traversal cannot escape staticDir", async () => {
  const res = await get("/%2e%2e/%2e%2e/etc/passwd");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("<h1>cardinal</h1>");
});

test("percent-decoding still serves a file that stays inside staticDir", async () => {
  const res = await get("/%61pp.js");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("console.log(1)");
});

test("encoded slashes cannot read a sibling directory", async () => {
  const secretDir = mkdtempSync(join(tmpdir(), "cardinal-static-secret-"));
  const secret = "SECRET-DO-NOT-SERVE";
  writeFileSync(join(secretDir, "secret.txt"), secret);
  try {
    const secretName = secretDir.slice(secretDir.lastIndexOf("/") + 1);
    for (const path of [
      `/%2e%2e%2f${secretName}%2fsecret.txt`,
      `/..%2f${secretName}%2fsecret.txt`,
    ]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe("<h1>cardinal</h1>");
      expect(body).not.toContain(secret);
    }
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});
