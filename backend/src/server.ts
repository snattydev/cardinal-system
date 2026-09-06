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
import { handleInbox, handleMarkRead, handleSendMessage } from "./api/messages";
import { handleSystem } from "./api/system";
import { handleCreateKey, handleListKeys, handleRevokeKey, handleValidateKey } from "./api/keys";
import { extractBearerKey } from "./api/router";
import { findActiveKeyByHash } from "@cardinal/db";
import { hashKey } from "@cardinal/keys";
import { handleChatCompletions, handleListModels } from "./api/router";
import {
  handleCreateRouterProvider,
  handleListRouterProviders,
  handleListRouterRoutes,
  handlePatchRouterProvider,
  handlePutRouterRoute,
} from "./api/router-dashboard";
import { handleLogin, handleLogout, handleMe } from "@cardinal/auth";
import { getSessionUser } from "@cardinal/auth";
import { Hub, type ConnData } from "@cardinal/ws";
import { serveStatic } from "./static";

type DashboardOrAgent = { kind: "dashboard" } | { kind: "agent"; agent: string; scopes: string[] };

function parseScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return [];
}

/** Dashboard JWT or active agent key. Used by board endpoints agents call via MCP. */
async function requireDashboardOrAgentKey(
  req: Request,
  jwtSecret: string,
  db: Database,
): Promise<DashboardOrAgent | null> {
  const user = await getSessionUser(req, jwtSecret);
  if (user) return { kind: "dashboard" };
  const svcKey = extractBearerKey(req);
  if (svcKey === null) return null;
  const keyRow = findActiveKeyByHash(db, hashKey(svcKey));
  if (keyRow === null) return null;
  return { kind: "agent", agent: keyRow.agent_name, scopes: parseScopes(keyRow.scopes) };
}

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

      // Service-to-service: valida agent keys sin JWT de dashboard. Solo responde
      // si la key es válida (401 si no), así se protege por naturaleza.
      if (pathname === "/api/internal/keys/validate" && method === "POST") {
        return handleValidateKey(db, req);
      }

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

      if (pathname === "/api/keys" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListKeys(db, req);
      }

      if (pathname === "/api/keys" && method === "POST") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleCreateKey(db, req);
      }

      const keyRevokeMatch = pathname.match(/^\/api\/keys\/([^/]+)\/revoke$/);
      if (keyRevokeMatch && method === "POST") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleRevokeKey(db, decodeURIComponent(keyRevokeMatch[1]!));
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
        const auth = await requireDashboardOrAgentKey(req, config.jwtSecret, db);
        if (auth === null) return json({ error: "unauthorized" }, 401);
        return handleRagSearch(db, req, auth.kind === "agent" ? { vaultScopes: auth.scopes } : {});
      }

      if (pathname === "/api/tasks" && method === "GET") {
        if ((await requireDashboardOrAgentKey(req, config.jwtSecret, db)) === null) {
          return json({ error: "unauthorized" }, 401);
        }
        return handleListTasks(db, req);
      }

      if (pathname === "/api/tasks" && method === "POST") {
        const auth = await requireDashboardOrAgentKey(req, config.jwtSecret, db);
        if (auth === null) return json({ error: "unauthorized" }, 401);
        const agent = auth.kind === "agent" ? auth.agent : undefined;
        return handleCreateTask(db, req, (t) => hub.broadcastTask(t), agent);
      }

      const taskClaimMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/claim$/);
      if (taskClaimMatch && method === "PUT") {
        const auth = await requireDashboardOrAgentKey(req, config.jwtSecret, db);
        if (auth === null) return json({ error: "unauthorized" }, 401);
        const agent = auth.kind === "agent" ? auth.agent : undefined;
        return handleClaimTask(db, decodeURIComponent(taskClaimMatch[1]!), req, (t) => hub.broadcastTask(t), agent);
      }

      const taskCompleteMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
      if (taskCompleteMatch && method === "PUT") {
        const auth = await requireDashboardOrAgentKey(req, config.jwtSecret, db);
        if (auth === null) return json({ error: "unauthorized" }, 401);
        const agent = auth.kind === "agent" ? auth.agent : undefined;
        return handleCompleteTask(
          db,
          decodeURIComponent(taskCompleteMatch[1]!),
          req,
          (t) => hub.broadcastTask(t),
          agent,
        );
      }

      const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskMatch && method === "GET") {
        if ((await requireDashboardOrAgentKey(req, config.jwtSecret, db)) === null) {
          return json({ error: "unauthorized" }, 401);
        }
        return handleGetTask(db, decodeURIComponent(taskMatch[1]!));
      }

      if (pathname === "/api/messages" && method === "GET") {
        const auth = await requireDashboardOrAgentKey(req, config.jwtSecret, db);
        if (auth === null) {
          return json({ error: "unauthorized" }, 401);
        }
        return handleInbox(db, req, auth.kind === "agent" ? auth.agent : undefined);
      }

      if (pathname === "/api/messages" && method === "POST") {
        const auth = await requireDashboardOrAgentKey(req, config.jwtSecret, db);
        if (auth === null) {
          return json({ error: "unauthorized" }, 401);
        }
        return handleSendMessage(
          db,
          req,
          (m) => hub.broadcastMessage(m),
          auth.kind === "agent" ? auth.agent : undefined,
        );
      }

      const messageReadMatch = pathname.match(/^\/api\/messages\/([^/]+)\/read$/);
      if (messageReadMatch && method === "PUT") {
        const auth = await requireDashboardOrAgentKey(req, config.jwtSecret, db);
        if (auth === null) {
          return json({ error: "unauthorized" }, 401);
        }
        return handleMarkRead(
          db,
          decodeURIComponent(messageReadMatch[1]!),
          req,
          (m) => hub.broadcastMessage(m),
          auth.kind === "agent" ? auth.agent : undefined,
        );
      }

      if (pathname === "/v1/chat/completions" && method === "POST") {
        return handleChatCompletions(req, db, config);
      }
      if (pathname === "/v1/models" && method === "GET") {
        return handleListModels(db);
      }

      if (pathname === "/api/router/providers" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListRouterProviders(db);
      }

      if (pathname === "/api/router/providers" && method === "POST") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleCreateRouterProvider(db, req, config.poolSecret);
      }

      if (pathname === "/api/router/routes" && method === "GET") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handleListRouterRoutes(db);
      }

      const routerProviderMatch = pathname.match(/^\/api\/router\/providers\/([^/]+)$/);
      if (routerProviderMatch && method === "PATCH") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handlePatchRouterProvider(db, decodeURIComponent(routerProviderMatch[1]!), req);
      }

      const routerRouteMatch = pathname.match(/^\/api\/router\/routes\/([^/]+)$/);
      if (routerRouteMatch && method === "PUT") {
        const user = await getSessionUser(req, config.jwtSecret);
        if (!user) return json({ error: "unauthorized" }, 401);
        return handlePutRouterRoute(db, routerRouteMatch[1]!, req);
      }

      if (pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);

      if (method === "GET") return serveStatic(req, config.staticDir);

      return json({ error: "method_not_allowed" }, 405);
    },

    websocket: {
      ...hub.websocket,
      maxPayloadLength: 4096, // protocolo usa mensajes ~200 bytes; default Bun es 16 MiB
    },
  });
}
