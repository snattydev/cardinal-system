import { join, normalize } from "node:path";

export async function serveStatic(req: Request, staticDir: string): Promise<Response> {
  const { pathname } = new URL(req.url);

  let rel = normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^(\/|\\)+/, "");
  if (rel === "" || rel === ".") rel = "index.html";

  const file = Bun.file(join(staticDir, rel));
  if (await file.exists()) return new Response(file);

  const index = Bun.file(join(staticDir, "index.html"));
  if (await index.exists()) {
    return new Response(index, { headers: { "content-type": "text/html" } });
  }

  return new Response("not found", { status: 404 });
}
