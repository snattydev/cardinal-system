import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { RouterHop, RouterModel, RouterProvider, RouterRoute } from "../lib/types";

const inputClass =
  "rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent";

const WIRE_FORMATS = ["openai", "anthropic", "gemini"] as const;

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

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [wireFormat, setWireFormat] = useState<(typeof WIRE_FORMATS)[number]>("openai");
  const [costPerMtok, setCostPerMtok] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function reloadCatalog(): Promise<void> {
    const [providersRes, routesRes] = await Promise.all([
      api<{ providers: RouterProvider[]; models: RouterModel[] }>("/api/router/providers"),
      api<{ routes: RouterRoute[] }>("/api/router/routes"),
    ]);
    setProviders(providersRes.providers);
    setModels(providersRes.models);
    setRoutes(routesRes.routes);
    setLoadStatus("ready");
  }

  useEffect(() => {
    let cancelled = false;
    reloadCatalog()
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

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setCreatedName(null);
    const costRaw = costPerMtok.trim();
    let cost: number | undefined;
    if (costRaw !== "") {
      const n = Number(costRaw);
      if (!Number.isFinite(n) || n < 0) {
        setError("invalid cost_per_mtok");
        return;
      }
      cost = n;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        base_url: baseUrl.trim(),
        api_key: apiKey,
        wire_format: wireFormat,
      };
      if (cost !== undefined) body.cost_per_mtok = cost;
      const res = await api<{ provider: RouterProvider; models: RouterModel[] }>(
        "/api/router/providers",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setCreatedName(res.provider.name);
      setApiKey("");
      await reloadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to add provider");
    } finally {
      setCreating(false);
    }
  }

  async function syncProviderModels(id: number): Promise<void> {
    setError(null);
    setSavingId(id);
    try {
      await api<{ provider: RouterProvider; models: RouterModel[] }>(
        `/api/router/providers/${id}/sync-models`,
        { method: "POST", body: JSON.stringify({}) },
      );
      await reloadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to sync models");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteProvider(id: number): Promise<void> {
    setError(null);
    try {
      await api<{ ok: true }>(`/api/router/providers/${id}`, { method: "DELETE" });
      setPendingDeleteId(null);
      if (editingId === id) setEditingId(null);
      await reloadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to delete provider");
      setPendingDeleteId(null);
    }
  }

  async function patchProvider(id: number, body: Record<string, unknown>): Promise<void> {
    setError(null);
    setSavingId(id);
    try {
      await api<{ provider: RouterProvider; models: RouterModel[] }>(
        `/api/router/providers/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      setEditingId(null);
      await reloadCatalog();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to update provider");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleProviderStatus(provider: RouterProvider): Promise<void> {
    const next = provider.status === "active" ? "disabled" : "active";
    await patchProvider(provider.id, { status: next });
  }

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

      <form
        onSubmit={(e) => void onCreate(e)}
        className="flex flex-col gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-4"
      >
        <h2 className="font-mono text-xs tracking-widest text-slate-500">ADD PROVIDER KEY</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="openrouter"
              required
              className={inputClass}
            />
          </label>
          <label className="flex min-w-56 flex-[2] flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">base url</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
              required
              className={inputClass}
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">api key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              required
              autoComplete="off"
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-36 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">wire format</span>
            <select
              value={wireFormat}
              onChange={(e) => setWireFormat(e.target.value as (typeof WIRE_FORMATS)[number])}
              className={inputClass}
            >
              {WIRE_FORMATS.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-32 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">cost / mtok</span>
            <input
              type="number"
              value={costPerMtok}
              onChange={(e) => setCostPerMtok(e.target.value)}
              step="any"
              placeholder="0"
              className={inputClass}
            />
          </label>
        </div>
        <p className="font-mono text-xs text-slate-500">models fetched from provider on save</p>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={creating}
            className="rounded border border-sao-accent/60 px-3 py-2 font-mono text-sm text-sao-accent transition-colors hover:bg-sao-accent/10 disabled:opacity-50"
          >
            {creating ? "saving" : "add key"}
          </button>
          {createdName && (
            <p className="font-mono text-xs text-sao-mint">saved {createdName} — key encrypted, never shown</p>
          )}
        </div>
      </form>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="filter alias, provider, model"
        className="max-w-md rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent"
      />

      <p className="font-mono text-xs text-slate-500">no live probe — models synced from provider API</p>

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
                      <th className="px-3 py-2 text-left font-normal">base_url</th>
                      <th className="px-3 py-2 text-left font-normal">models</th>
                      <th className="px-3 py-2 text-left font-normal">status</th>
                      <th className="px-3 py-2 text-left font-normal">cost_per_mtok</th>
                      <th className="px-3 py-2 text-left font-normal">wire_format</th>
                      <th className="px-3 py-2 text-left font-normal">actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sao-accent/10">
                    {filteredProviders.map((provider) => {
                      const owned = models.filter((m) => m.provider_id === provider.id);
                      return (
                        <ProviderRow
                          key={provider.id}
                          provider={provider}
                          models={owned}
                          pendingDelete={pendingDeleteId === provider.id}
                          editing={editingId === provider.id}
                          saving={savingId === provider.id}
                          onEdit={() => {
                            setPendingDeleteId(null);
                            setEditingId(provider.id);
                          }}
                          onCancelEdit={() => setEditingId(null)}
                          onAskDelete={() => {
                            setEditingId(null);
                            setPendingDeleteId(provider.id);
                          }}
                          onCancelDelete={() => setPendingDeleteId(null)}
                          onConfirmDelete={() => void deleteProvider(provider.id)}
                          onToggleStatus={() => void toggleProviderStatus(provider)}
                          onSave={(body) => void patchProvider(provider.id, body)}
                          onSyncModels={() => void syncProviderModels(provider.id)}
                        />
                      );
                    })}
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
  pendingDelete,
  editing,
  saving,
  onEdit,
  onCancelEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleStatus,
  onSave,
  onSyncModels,
}: {
  provider: RouterProvider;
  models: RouterModel[];
  pendingDelete: boolean;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onToggleStatus: () => void;
  onSave: (body: Record<string, unknown>) => void;
  onSyncModels: () => void;
}) {
  const modelList = models.map((m) => m.model_id).join(", ");
  return (
    <>
      <tr className="align-top">
        <td className="px-3 py-2 text-sao-accent">{provider.name}</td>
        <td className="max-w-xs break-all px-3 py-2 text-slate-400">{provider.base_url}</td>
        <td className="max-w-xl break-all px-3 py-2 text-slate-300">
          {models.length > 0 ? (
            <>
              <span className="text-slate-500">{models.length} · </span>
              {modelList}
            </>
          ) : (
            "—"
          )}
        </td>
        <td className={`px-3 py-2 ${statusClass(provider.status)}`}>{provider.status}</td>
        <td className="px-3 py-2 text-slate-300">{provider.cost_per_mtok}</td>
        <td className="px-3 py-2 text-sao-violet">{provider.wire_format}</td>
        <td className="px-3 py-2">
          {pendingDelete ? (
            <span className="flex gap-2">
              <button type="button" onClick={onConfirmDelete} className="text-red-400 hover:text-red-300">
                sí
              </button>
              <button type="button" onClick={onCancelDelete} className="text-slate-500 hover:text-sao-accent">
                no
              </button>
            </span>
          ) : (
            <span className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onEdit}
                disabled={saving}
                className="text-sao-violet hover:text-sao-accent disabled:opacity-50"
              >
                configurar
              </button>
              <button
                type="button"
                onClick={onToggleStatus}
                disabled={saving}
                className="text-slate-500 hover:text-sao-accent disabled:opacity-50"
              >
                {provider.status === "active" ? "disable" : "enable"}
              </button>
              <button
                type="button"
                onClick={onSyncModels}
                disabled={saving}
                className="text-slate-500 hover:text-sao-accent disabled:opacity-50"
              >
                sync models
              </button>
              <button
                type="button"
                onClick={onAskDelete}
                disabled={saving}
                className="text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                eliminar
              </button>
            </span>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7} className="border-t border-sao-accent/10 bg-sao-bg/40 px-3 py-3">
            <ProviderEditForm
              provider={provider}
              saving={saving}
              onCancel={onCancelEdit}
              onSave={onSave}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ProviderEditForm({
  provider,
  saving,
  onCancel,
  onSave,
}: {
  provider: RouterProvider;
  saving: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(provider.base_url);
  const [wireFormat, setWireFormat] = useState(provider.wire_format);
  const [costPerMtok, setCostPerMtok] = useState(String(provider.cost_per_mtok));
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState(provider.status);

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    const costRaw = costPerMtok.trim();
    const n = Number(costRaw);
    if (costRaw !== "" && (!Number.isFinite(n) || n < 0)) return;

    const body: Record<string, unknown> = {
      base_url: baseUrl.trim(),
      wire_format: wireFormat,
      status,
    };
    if (costRaw !== "") body.cost_per_mtok = n;
    if (apiKey.trim().length > 0) body.api_key = apiKey;
    onSave(body);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="font-mono text-xs tracking-widest text-slate-500">EDIT {provider.name}</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-56 flex-[2] flex-col gap-1">
          <span className="font-mono text-xs tracking-widest text-slate-500">base url</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required className={inputClass} />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className="font-mono text-xs tracking-widest text-slate-500">api key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="blank = keep current"
            autoComplete="off"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-36 flex-col gap-1">
          <span className="font-mono text-xs tracking-widest text-slate-500">status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RouterProvider["status"])}
            className={inputClass}
          >
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-36 flex-col gap-1">
          <span className="font-mono text-xs tracking-widest text-slate-500">wire format</span>
          <select
            value={wireFormat}
            onChange={(e) => setWireFormat(e.target.value as (typeof WIRE_FORMATS)[number])}
            className={inputClass}
          >
            {WIRE_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-32 flex-col gap-1">
          <span className="font-mono text-xs tracking-widest text-slate-500">cost / mtok</span>
          <input
            type="number"
            value={costPerMtok}
            onChange={(e) => setCostPerMtok(e.target.value)}
            step="any"
            className={inputClass}
          />
        </label>
      </div>
      <p className="font-mono text-xs text-slate-500">models re-fetched when base url, wire format, or api key change</p>
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded border border-sao-accent/60 px-3 py-2 font-mono text-sm text-sao-accent transition-colors hover:bg-sao-accent/10 disabled:opacity-50"
        >
          {saving ? "saving" : "save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded border border-sao-accent/20 px-3 py-2 font-mono text-sm text-slate-500 transition-colors hover:text-sao-accent disabled:opacity-50"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
