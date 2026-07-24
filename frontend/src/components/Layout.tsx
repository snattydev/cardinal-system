import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export default function Layout() {
  const { logout } = useAuth();
  const [version, setVersion] = useState<string>("");
  const [agentsOpen, setAgentsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api<{ version: string }>("/api/health")
      .then((res) => setVersion(res.version))
      .catch(() => setVersion(""));
  }, []);

  const isAgentsActive =
    location.pathname.startsWith("/agents") || location.pathname.startsWith("/keys");

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded border px-3 py-2 font-mono text-sm transition-colors ${
      isActive
        ? "border-sao-accent/60 bg-sao-panel text-sao-accent"
        : "border-transparent text-slate-400 hover:text-sao-accent hover:border-sao-accent/30"
    }`;

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col border-r border-sao-accent/20 bg-sao-panel/40">
        <div className="px-4 py-5 font-mono text-lg tracking-widest text-sao-accent">
          CARDINAL
        </div>

        <nav className="flex flex-col gap-1 px-3">
          <NavLink to="/" end className={linkClass}>
            Overview
          </NavLink>

          {/* Agents dropdown */}
          <div className="flex flex-col">
            <button
              onClick={() => setAgentsOpen((v) => !v)}
              className={`flex w-full items-center gap-2 rounded border px-3 py-2 font-mono text-sm transition-colors ${
                isAgentsActive
                  ? "border-sao-accent/60 bg-sao-panel text-sao-accent"
                  : "border-transparent text-slate-400 hover:text-sao-accent hover:border-sao-accent/30"
              }`}
            >
              <span className="w-3 text-xs">{agentsOpen ? "▾" : "▸"}</span>
              Agents
            </button>
            {agentsOpen && (
              <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-sao-accent/20 pl-3">
                <NavLink to="/agents" end className={linkClass}>
                  Hub
                </NavLink>
                <span className="flex items-center justify-between rounded border border-transparent px-3 py-2 font-mono text-sm text-slate-600 select-none">
                  Keys
                  <span className="text-xs text-slate-600">Fase 2</span>
                </span>
              </div>
            )}
          </div>

          <NavLink to="/settings" className={linkClass}>
            Settings
          </NavLink>
        </nav>

        <div className="mt-auto flex flex-col gap-3 px-3 pb-4">
          <button
            onClick={() => void logout()}
            className="rounded border border-sao-violet/40 px-3 py-2 font-mono text-sm text-sao-violet transition-colors hover:bg-sao-violet/10"
          >
            logout
          </button>
          <div className="px-1 font-mono text-xs text-slate-500">v{version}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
