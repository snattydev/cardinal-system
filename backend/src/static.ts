import { join, resolve } from "node:path";

export async function serveStatic(req: Request, staticDir: string): Promise<Response> {
  const { pathname } = new URL(req.url);
  const root = resolve(staticDir);

  let rel = decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  if (rel === "" || rel === ".") rel = "index.html";

  const target = resolve(root, rel);
  const inside = target === root || target.startsWith(`${root}/`);

  if (inside) {
    const file = Bun.file(target);
    if (await file.exists()) return new Response(file);
  }

  const index = Bun.file(join(root, "index.html"));
  if (await index.exists()) {
    return new Response(index, { headers: { "content-type": "text/html" } });
  }

  return new Response("not found", { status: 404 });
}
