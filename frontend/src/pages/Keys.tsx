import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { useRoster } from "../hooks/useRoster";
import type { KeyItem, RouterCatalogItem } from "../lib/types";

const inputClass =
  "rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent";

function fmtBudget(used: number, limit: number | null): string {
  return limit === null ? `${used} / ∞` : `${used} / ${limit}`;
}

function fmtWhen(value: string | null): string {
  return value ?? "never";
}

function fmtExpiry(value: string | null): string {
  return value ?? "∞";
}


function parseOptionalNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export default function Keys() {
  const roster = useRoster();
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [history, setHistory] = useState<KeyItem[] | null>(null);
  const [historyLoadStatus, setHistoryLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [showHistory, setShowHistory] = useState(false);
  const showHistoryRef = useRef(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [agentName, setAgentName] = useState("");
  const [catalog, setCatalog] = useState<RouterCatalogItem[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedModel, setSelectedModel] = useState("");
  const [budgetTokens, setBudgetTokens] = useState("");
  const [expires, setExpires] = useState("");
  const [usdCap, setUsdCap] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ keys: KeyItem[] }>("/api/keys"),
      api<{ items: RouterCatalogItem[] }>("/api/router/catalog"),
    ])
      .then(([keysRes, catalogRes]) => {
        if (cancelled) return;
        setKeys(keysRes.keys);
        setCatalog(catalogRes.items);
        setCatalogStatus("ready");
        setLoadStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setError("failed to load keys");
        setLoadStatus("error");
        setCatalogStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadHistory(): Promise<void> {
    const res = await api<{ keys: KeyItem[] }>("/api/keys?status=revoked");
    setHistory((prev) => {
      if (prev === null) return res.keys;

      const existingIds = new Set(prev.map((key) => key.id));
      return [...prev, ...res.keys.filter((key) => !existingIds.has(key.id))];
    });
  }

  async function toggleHistory(): Promise<void> {
    setError(null);
    const next = !showHistory;
    showHistoryRef.current = next;
    setShowHistory(next);
    if (next && history === null) {
      setHistoryLoadStatus("loading");
      try {
        await loadHistory();
        setHistoryLoadStatus("ready");
      } catch {
        setError("failed to load history");
        setHistoryLoadStatus("error");
      }
    }
  }

  async function confirmRevoke(id: number): Promise<void> {
    setError(null);
    try {
      const res = await api<{ key: KeyItem }>(`/api/keys/${id}/revoke`, { method: "POST" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
      if (showHistoryRef.current) {
        setHistory((prev) => {
          if (prev === null) return null;
          return [res.key, ...prev.filter((key) => key.id !== res.key.id)];
        });
      }
      setPendingId(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "revoke failed";
      setError(message);
      setPendingId(null);
    }
  }

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setCopied(false);

    const name = agentName.trim();
    if (name.length === 0 || selectedModel.length === 0) return;

    const body: {
      agentName: string;
      scopes?: string[];
      budgetLimit?: number | null;
      expiresAt?: string | null;
      budgetUsdLimit?: number | null;
    } = {
      agentName: name,
      scopes: [selectedModel],
    };

    const tokens = parseOptionalNumber(budgetTokens);
    if (tokens !== undefined) body.budgetLimit = tokens;

    if (expires.trim().length > 0) {
      body.expiresAt = new Date(expires).toISOString();
    }

    const usd = parseOptionalNumber(usdCap);
    if (usd !== undefined) body.budgetUsdLimit = usd;

    setCreating(true);
    try {
      const res = await api<{ key: string; item: KeyItem }>("/api/keys", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreatedKey(res.key);
      setKeys((prev) => [res.item, ...prev.filter((k) => k.id !== res.item.id)]);
      setAgentName("");
      setSelectedModel("");
      setBudgetTokens("");
      setExpires("");
      setUsdCap("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "create failed";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  async function copyCreatedKey(): Promise<void> {
    if (createdKey === null) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
    } catch {
      setError("copy failed");
    }
  }

  const rosterNames = [...roster.keys()];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg tracking-widest text-sao-accent">KEYS</h1>
        <button
          type="button"
          onClick={() => void toggleHistory()}
          aria-label="pasadas"
          title="pasadas"
          className={`rounded border p-1.5 text-slate-500 transition-colors hover:border-sao-accent/40 hover:text-sao-accent ${
            showHistory ? "border-sao-accent/60 text-sao-accent" : "border-transparent"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.25" />
            <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>
      </div>

      <form
        onSubmit={(e) => void onCreate(e)}
        className="flex flex-col gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-4"
      >
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">agent name</span>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              list="roster-agents"
              placeholder="agent"
              required
              className={inputClass}
            />
            <datalist id="roster-agents">
              {rosterNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <CatalogSearcher
            items={catalog}
            value={selectedModel}
            onChange={setSelectedModel}
            status={catalogStatus}
          />
          <label className="flex min-w-32 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">budget tokens</span>
            <input
              type="number"
              value={budgetTokens}
              onChange={(e) => setBudgetTokens(e.target.value)}
              placeholder="∞"
              className={inputClass}
            />
          </label>
          <label className="flex min-w-44 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">expires</span>
            <input
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex min-w-32 flex-col gap-1">
            <span className="font-mono text-xs tracking-widest text-slate-500">USD cap</span>
            <input
              type="number"
              value={usdCap}
              onChange={(e) => setUsdCap(e.target.value)}
              step="any"
              placeholder="∞"
              className={inputClass}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating || selectedModel.length === 0 || catalog.length === 0}
          className="w-fit rounded border border-sao-accent bg-sao-accent/10 px-3 py-2 font-mono text-sm text-sao-accent transition-colors hover:bg-sao-accent/20 disabled:opacity-50"
        >
          crear
        </button>
      </form>

      {error && <p className="font-mono text-sm text-red-400">{error}</p>}

      {createdKey !== null && (
        <div className="flex flex-col gap-2 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-4">
          <p className="font-mono text-xs tracking-widest text-sao-accent">PLAINTEXT — shown once</p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="break-all font-mono text-sm text-sao-accent">{createdKey}</code>
            <button
              type="button"
              onClick={() => void copyCreatedKey()}
              className="rounded border border-sao-accent bg-sao-accent/10 px-3 py-1.5 font-mono text-xs tracking-widest text-sao-accent transition-colors hover:bg-sao-accent/20"
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
        </div>
      )}

      {loadStatus === "ready" && keys.length === 0 ? (
        <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6 font-mono text-sm text-slate-500">
          no persistent keys — create one with the form above
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/60">
          {keys.map((key) => (
            <div key={key.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 font-mono text-sm">
              <span className="text-sao-accent">{key.agentName}</span>
              <span className="text-slate-400">{key.scopes.join(", ")}</span>
              <span className="text-slate-400">{fmtBudget(key.budgetUsed, key.budgetLimit)}</span>
              <span className="text-slate-500">exp {fmtExpiry(key.expiresAt)}</span>
              <span className="text-slate-400">{fmtBudget(key.budgetUsdUsed, key.budgetUsdLimit)}</span>
              <span className="text-slate-500">created {fmtWhen(key.createdAt)}</span>
              <span className="text-slate-500">last used {fmtWhen(key.lastUsedAt)}</span>
              <span className="ml-auto">
                {pendingId === key.id ? (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmRevoke(key.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingId(null)}
                      className="text-slate-500 hover:text-sao-accent"
                    >
                      no
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingId(key.id)}
                    className="text-sao-violet hover:text-sao-accent"
                  >
                    revocar
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {showHistory && (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-xs tracking-widest text-slate-500">PASADAS</h2>
          {historyLoadStatus === "error" ? (
            <p className="font-mono text-sm text-red-400">failed to load history</p>
          ) : history === null ? (
            <p className="font-mono text-sm text-slate-600">loading…</p>
          ) : history.length === 0 ? (
            <p className="font-mono text-sm text-slate-600">no revoked keys</p>
          ) : (
            <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/40">
              {history.map((key) => (
                <div key={key.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 font-mono text-sm text-slate-500">
                  <span>{key.agentName}</span>
                  <span>{key.scopes.join(", ")}</span>
                  <span>{fmtBudget(key.budgetUsed, key.budgetLimit)}</span>
                  <span>exp {fmtExpiry(key.expiresAt)}</span>
                  <span>{fmtBudget(key.budgetUsdUsed, key.budgetUsdLimit)}</span>
                  <span>revoked {fmtWhen(key.revokedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function CatalogSearcher({
  items,
  value,
  onChange,
  status,
}: {
  items: RouterCatalogItem[];
  value: string;
  onChange: (id: string) => void;
  status: "loading" | "ready" | "error";
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(event: MouseEvent): void {
      if (rootRef.current === null) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return items;
    return items.filter(
      (item) => item.id.toLowerCase().includes(q) || item.kind.toLowerCase().includes(q),
    );
  }, [items, query]);

  const selected = items.find((item) => item.id === value) ?? null;

  return (
    <label className="flex min-w-56 flex-1 flex-col gap-1">
      <span className="font-mono text-xs tracking-widest text-slate-500">model</span>
      <div ref={rootRef} className="relative">
        <input
          value={open ? query : (selected?.id ?? "")}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value.length > 0) onChange("");
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          placeholder={status === "loading" ? "loading catalog" : "search model, alias, fusion"}
          autoComplete="off"
          className={`${inputClass} w-full`}
        />
        {open && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-sao-accent/20 bg-sao-panel">
            {status === "error" && (
              <li className="px-3 py-2 font-mono text-xs text-red-400">failed to load catalog</li>
            )}
            {status === "ready" && items.length === 0 && (
              <li className="px-3 py-2 font-mono text-xs text-slate-500">
                no catalog — add a provider on /router
              </li>
            )}
            {status === "ready" && items.length > 0 && filtered.length === 0 && (
              <li className="px-3 py-2 font-mono text-xs text-slate-500">no matching models</li>
            )}
            {filtered.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(item.id);
                    setQuery("");
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-xs hover:bg-sao-accent/10 ${
                    item.id === value ? "text-sao-accent" : "text-slate-300"
                  }`}
                >
                  <span>{item.id}</span>
                  <span className="tracking-widest text-slate-500">{item.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  );
}
