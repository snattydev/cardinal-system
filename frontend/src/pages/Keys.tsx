import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { KeyItem } from "../lib/types";

function fmtBudget(used: number, limit: number | null): string {
  return limit === null ? `${used} / ∞` : `${used} / ${limit}`;
}

function fmtWhen(value: string | null): string {
  return value ?? "never";
}

export default function Keys() {
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [history, setHistory] = useState<KeyItem[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ keys: KeyItem[] }>("/api/keys")
      .then((res) => {
        if (!cancelled) setKeys(res.keys);
      })
      .catch(() => {
        if (!cancelled) setError("failed to load keys");
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
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) {
      try {
        await loadHistory();
      } catch {
        setError("failed to load history");
      }
    }
  }

  async function confirmRevoke(id: number): Promise<void> {
    try {
      const res = await api<{ key: KeyItem }>(`/api/keys/${id}/revoke`, { method: "POST" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
      if (showHistory) {
        setHistory((prev) => {
          const historyKeys = prev ?? [];
          return [res.key, ...historyKeys.filter((key) => key.id !== res.key.id)];
        });
      }
      setPendingId(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "revoke failed";
      setError(message);
      setPendingId(null);
    }
  }

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

      {error && <p className="font-mono text-sm text-red-400">{error}</p>}

      {keys.length === 0 ? (
        <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6 font-mono text-sm text-slate-500">
          no persistent keys — create one with{" "}
          <span className="text-sao-accent">bun run keygen -- --agent &lt;name&gt;</span>
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/60">
          {keys.map((key) => (
            <div key={key.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 font-mono text-sm">
              <span className="text-sao-accent">{key.agentName}</span>
              <span className="text-slate-400">{key.scopes.join(", ")}</span>
              <span className="text-slate-400">{fmtBudget(key.budgetUsed, key.budgetLimit)}</span>
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
          {history === null ? (
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
