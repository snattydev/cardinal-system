import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import type { Config } from "./config";
import { json } from "./http";
import { handleHealth } from "./api/health";
import { handleGetAgent, handleListAgents } from "./api/agents";
import { handleLogin, handleLogout, handleMe } from "./auth/routes";
import { getSessionUser } from "./auth/session";
import { Hub, type ConnData } from "./ws/hub";
import { serveStatic } from "./static";

export function createServer(config: Config, db: Database): Server<ConnData> {
  const hub = new Hub(db, { pingIntervalMs: config.pingIntervalMs });

  return Bun.serve<ConnData>({
    port: config.port,

    async fetch(req, server) {
      const { pathname } = new URL(req.url);
      const method = req.method;

      if (method === "GET" && pathname === "/ws") {
        const user = await getSessionUser(req, config.jwtSecret);
        const upgraded = server.upgrade(req, {
          data: { dashboardAuthed: user !== null, role: null, agentName: null },
        });
        return upgraded ? undefined : new Response("upgrade failed", { status: 400 });
      }

      if (pathname === "/api/health") return handleHealth();

      if (pathname === "/api/auth/login" && method === "POST") return handleLogin(req, config);
      if (pathname === "/api/auth/logout" && method === "POST") return handleLogout();
      if (pathname === "/api/auth/me" && method === "GET") return handleMe(req, config);

      if (pathname === "/api/agents" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListAgents(db);
      }

      const agentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
      if (agentMatch && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleGetAgent(db, decodeURIComponent(agentMatch[1]!));
      }

      if (pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);

      if (method === "GET") return serveStatic(req, config.staticDir);

      return json({ error: "method_not_allowed" }, 405);
    },

    websocket: hub.websocket,
  });
}
