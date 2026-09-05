import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { RouterHop, RouterModel, RouterProvider, RouterRoute } from "../lib/types";

function statusClass(status: RouterProvider["status"]): string {
  return status === "active" ? "text-sao-mint" : "text-slate-500";
}

function providerByName(
  providers: RouterProvider[],
  name: string,
): RouterProvider | undefined {
  return providers.find((p) => p.name === name);
}

function hopLabel(hop: RouterHop): string {
  return `${hop.provider}/${hop.model}`;
}

function includesQuery(q: string, ...parts: string[]): boolean {
  if (q.length === 0) return true;
  return parts.some((p) => p.toLowerCase().includes(q));
}

export default function Router() {
  const [providers, setProviders] = useState<RouterProvider[]>([]);
  const [models, setModels] = useState<RouterModel[]>([]);
  const [routes, setRoutes] = useState<RouterRoute[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ providers: RouterProvider[]; models: RouterModel[] }>("/api/router/providers"),
      api<{ routes: RouterRoute[] }>("/api/router/routes"),
    ])
      .then(([providersRes, routesRes]) => {
        if (!cancelled) {
          setProviders(providersRes.providers);
          setModels(providersRes.models);
          setRoutes(routesRes.routes);
          setLoadStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("failed to load router");
          setLoadStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();

  const filteredRoutes = useMemo(() => {
    return routes.filter((route) =>
      includesQuery(
        q,
        route.alias,
        ...route.fallback_chain.flatMap((hop) => [hop.provider, hop.model, hopLabel(hop)]),
      ),
    );
  }, [routes, q]);

  const filteredProviders = useMemo(() => {
    return providers.filter((provider) => {
      const owned = models.filter((m) => m.provider_id === provider.id);
      return includesQuery(q, provider.name, ...owned.map((m) => m.model_id));
    });
  }, [providers, models, q]);

  const emptyCatalog = loadStatus === "ready" && routes.length === 0 && providers.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-mono text-lg tracking-widest text-sao-accent">ROUTER</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter alias, provider, model"
        className="max-w-md rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent"
      />

      <p className="font-mono text-xs text-slate-500">no live probe — stored provider status</p>

      {error && <p className="font-mono text-sm text-red-400">{error}</p>}

      {loadStatus === "loading" && (
        <p className="font-mono text-sm text-slate-500">loading</p>
      )}

      {emptyCatalog && (
        <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6 font-mono text-sm text-slate-500">
          no routes or providers
        </p>
      )}

      {loadStatus === "ready" && !emptyCatalog && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-mono text-xs tracking-widest text-slate-500">ROUTES</h2>
            {filteredRoutes.length === 0 ? (
              <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-4 font-mono text-xs text-slate-500">
                {q ? "no matching routes" : "no routes"}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-sao-accent/20 bg-sao-panel/60">
                <table className="w-full border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-sao-accent/20 tracking-widest text-slate-500">
                      <th className="px-3 py-2 text-left font-normal">alias</th>
                      <th className="px-3 py-2 text-left font-normal">hops</th>
                      <th className="px-3 py-2 text-left font-normal">status</th>
                      <th className="px-3 py-2 text-left font-normal">cost_per_mtok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sao-accent/10">
                    {filteredRoutes.map((route) => (
                      <RouteRow
                        key={route.alias}
                        route={route}
                        providers={providers}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-mono text-xs tracking-widest text-slate-500">PROVIDERS</h2>
            {filteredProviders.length === 0 ? (
              <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-4 font-mono text-xs text-slate-500">
                {q ? "no matching providers" : "no providers"}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-sao-accent/20 bg-sao-panel/60">
                <table className="w-full border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-sao-accent/20 tracking-widest text-slate-500">
                      <th className="px-3 py-2 text-left font-normal">name</th>
                      <th className="px-3 py-2 text-left font-normal">models</th>
                      <th className="px-3 py-2 text-left font-normal">status</th>
                      <th className="px-3 py-2 text-left font-normal">cost_per_mtok</th>
                      <th className="px-3 py-2 text-left font-normal">wire_format</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sao-accent/10">
                    {filteredProviders.map((provider) => (
                      <ProviderRow
                        key={provider.id}
                        provider={provider}
                        models={models.filter((m) => m.provider_id === provider.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function RouteRow({
  route,
  providers,
}: {
  route: RouterRoute;
  providers: RouterProvider[];
}) {
  const hops = route.fallback_chain;
  const hopsText = hops.map(hopLabel).join(" → ");
  const statuses = hops.map((hop) => providerByName(providers, hop.provider)?.status ?? null);
  const costs = hops.map((hop) => providerByName(providers, hop.provider)?.cost_per_mtok);

  return (
    <tr>
      <td className="px-3 py-2 text-sao-accent">{route.alias}</td>
      <td className="px-3 py-2 text-slate-300">{hopsText.length > 0 ? hopsText : "—"}</td>
      <td className="px-3 py-2">
        {hops.length === 0 ? (
          <span className="text-slate-500">—</span>
        ) : (
          statuses.map((status, i) => (
            <span key={`${route.alias}-st-${i}`}>
              {i > 0 && <span className="text-slate-600"> → </span>}
              {status ? (
                <span className={statusClass(status)}>{status}</span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </span>
          ))
        )}
      </td>
      <td className="px-3 py-2 text-slate-300">
        {hops.length === 0
          ? "—"
          : costs
              .map((cost) => (cost === undefined ? "—" : String(cost)))
              .join(" → ")}
      </td>
    </tr>
  );
}

function ProviderRow({
  provider,
  models,
}: {
  provider: RouterProvider;
  models: RouterModel[];
}) {
  const modelList = models.map((m) => m.model_id).join(", ");
  return (
    <tr>
      <td className="px-3 py-2 text-sao-accent">{provider.name}</td>
      <td className="px-3 py-2 text-slate-300">{modelList.length > 0 ? modelList : "—"}</td>
      <td className={`px-3 py-2 ${statusClass(provider.status)}`}>{provider.status}</td>
      <td className="px-3 py-2 text-slate-300">{provider.cost_per_mtok}</td>
      <td className="px-3 py-2 text-sao-violet">{provider.wire_format}</td>
    </tr>
  );
}
