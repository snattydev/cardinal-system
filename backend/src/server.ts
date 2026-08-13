import type { Server } from "bun";
import type { Database } from "bun:sqlite";
import type { Config } from "@cardinal/core";
import { json } from "@cardinal/core";
import { handleHealth } from "./api/health";
import { handleGetAgent, handleListAgents } from "./api/agents";
import { handleDeviceHeartbeat, handleListDevices } from "./api/devices";
import { handleGetProfile, handleListProfiles, handlePutProfile } from "./api/profiles";
import { handleGetSoul } from "./api/souls";
import { handleGetSkill, handleListProfileSkills, handleListSkills } from "./api/skills";
import { handleGetConfig, handlePutConfig } from "./api/config";
import { handleGetMemory, handlePutMemory } from "./api/memories";
import { handleListSessions } from "./api/sessions";
import { handleRagSearch } from "./api/rag";
import {
  handleClaimTask,
  handleCompleteTask,
  handleCreateTask,
  handleGetTask,
  handleListTasks,
} from "./api/tasks";
import { handleSystem } from "./api/system";
import { handleLogin, handleLogout, handleMe } from "@cardinal/auth";
import { getSessionUser } from "@cardinal/auth";
import { Hub, type ConnData } from "@cardinal/ws";
import { serveStatic } from "./static";

export function createServer(config: Config, db: Database): Server<ConnData> {
  const hub = new Hub(db, { pingIntervalMs: config.pingIntervalMs });

  return Bun.serve<ConnData>({
    port: config.port,
    maxPayloadLength: 4096, // protocolo usa mensajes ~200 bytes; default Bun es 16 MiB

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

      if (pathname === "/api/devices" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListDevices(db);
      }

      if (pathname === "/api/devices/heartbeat" && method === "POST") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        const body = (await req.clone().json().catch(() => null)) as
          | { agent?: unknown }
          | null
          | undefined;
        const name = typeof body?.agent === "string" ? body.agent : null;
        if (!name) return json({ error: "bad_request" }, 400);
        return handleDeviceHeartbeat(db, name, req);
      }

      if (pathname === "/api/profiles" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListProfiles(db);
      }

      const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if (profileMatch && (method === "GET" || method === "PUT")) {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        const name = decodeURIComponent(profileMatch[1]!);
        if (method === "PUT") return handlePutProfile(db, name, req);
        return handleGetProfile(db, name);
      }

      if (pathname === "/api/system" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleSystem(config, db);
      }

      const soulMatch = pathname.match(/^\/api\/souls\/([^/]+)$/);
      if (soulMatch && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleGetSoul(db, decodeURIComponent(soulMatch[1]!));
      }

      if (pathname === "/api/skills" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListSkills(db);
      }

      if (pathname === "/api/sessions" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListSessions(db);
      }

      const skillMatch = pathname.match(/^\/api\/skills\/([^/]+)$/);
      if (skillMatch && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleGetSkill(db, decodeURIComponent(skillMatch[1]!));
      }

      const profileSkillsMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/skills$/);
      if (profileSkillsMatch && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListProfileSkills(db, decodeURIComponent(profileSkillsMatch[1]!));
      }

      const configMatch = pathname.match(/^\/api\/config\/([^/]+)$/);
      if (configMatch && (method === "GET" || method === "PUT")) {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        const name = decodeURIComponent(configMatch[1]!);
        if (method === "PUT") return handlePutConfig(db, name, req);
        return handleGetConfig(db, name);
      }

      const memoryMatch = pathname.match(/^\/api\/memories\/([^/]+)\/(memory|user)$/);
      if (memoryMatch && (method === "GET" || method === "PUT")) {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        const profileName = decodeURIComponent(memoryMatch[1]!);
        const target = memoryMatch[2] as "memory" | "user";
        if (method === "PUT") return handlePutMemory(db, profileName, target, req);
        return handleGetMemory(db, profileName, target);
      }

      if (pathname === "/api/rag/search" && method === "POST") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleRagSearch(db, req);
      }

      if (pathname === "/api/tasks" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListTasks(db);
      }

      if (pathname === "/api/tasks" && method === "POST") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleCreateTask(db, req);
      }

      const taskClaimMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/claim$/);
      if (taskClaimMatch && method === "PUT") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleClaimTask(db, decodeURIComponent(taskClaimMatch[1]!), req);
      }

      const taskCompleteMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
      if (taskCompleteMatch && method === "PUT") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleCompleteTask(db, decodeURIComponent(taskCompleteMatch[1]!), req);
      }

      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleGetTask(db, decodeURIComponent(taskMatch[1]!));
      }

      if (pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);

      if (method === "GET") return serveStatic(req, config.staticDir);

      return json({ error: "method_not_allowed" }, 405);
    },

    websocket: hub.websocket,
  });
}
