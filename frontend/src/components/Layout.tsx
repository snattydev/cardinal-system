import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export default function Layout() {
  const { logout } = useAuth();
  const [version, setVersion] = useState<string>("");
  const location = useLocation();
  const [routerOpen, setRouterOpen] = useState(
    () => location.pathname.startsWith("/router") || location.pathname.startsWith("/keys"),
  );

  useEffect(() => {
    api<{ version: string }>("/api/health")
      .then((res) => setVersion(res.version))
      .catch(() => setVersion(""));
  }, []);

  const isRouterActive =
    location.pathname.startsWith("/router") || location.pathname.startsWith("/keys");

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-[2px] border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-all duration-150 ${
      isActive
        ? "border-sao-aincrad/50 bg-sao-elevated text-sao-aincrad shadow-[0_0_15px_rgba(255,122,0,0.12)] font-semibold"
        : "border-transparent text-sao-muted hover:text-sao-text hover:bg-white/5"
    }`;

  const sectionClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-[2px] border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-all duration-150 ${
      active
        ? "border-sao-aincrad/50 bg-sao-elevated text-sao-aincrad shadow-[0_0_15px_rgba(255,122,0,0.12)] font-semibold"
        : "border-transparent text-sao-muted hover:text-sao-text hover:bg-white/5"
    }`;

  return (
    <div className="flex h-screen bg-sao-obsidian text-sao-text">
      <aside className="flex w-60 flex-col border-r border-white/5 bg-sao-graphite">
        <div className="px-4 py-5 flex items-center gap-2 font-mono text-sm tracking-widest text-sao-text uppercase border-b border-white/5">
          <span className="w-2 h-2 bg-sao-aincrad shadow-[0_0_8px_#FF7A00]"></span>
          CARDINAL <span className="text-[10px] text-sao-muted font-normal">SYSTEM</span>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          <NavLink to="/" end className={linkClass}>
            Overview
          </NavLink>

          <NavLink to="/agents" className={linkClass}>
            Agents
          </NavLink>

          <NavLink to="/tasks" className={linkClass}>
            Tasks
          </NavLink>

          <div className="flex flex-col">
            <button
              onClick={() => setRouterOpen((v) => !v)}
              className={sectionClass(isRouterActive)}
            >
              <span className="w-3 text-xs">{routerOpen ? "▾" : "▸"}</span>
              Router
            </button>
            {routerOpen && (
              <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-white/10 pl-3">
                <NavLink to="/router" end className={linkClass}>
                  Catalog
                </NavLink>
                <NavLink to="/keys" className={linkClass}>
                  Keys
                </NavLink>
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
            className="rounded-[2px] border border-sao-underworld/40 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-sao-underworld transition-colors hover:bg-sao-underworld/10"
          >
            Logout
          </button>
          <div className="flex items-center justify-between px-1 font-mono text-[11px] text-sao-muted">
            <span>SYS STATUS</span>
            <span className="text-sao-sinon">v{version || "0.2.6"}</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
