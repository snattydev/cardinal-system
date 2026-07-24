import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { AgentEvent } from "../lib/types";
import { useRoster } from "../hooks/useRoster";

export default function AgentDetail() {
  const { name = "" } = useParams();
  const roster = useRoster();
  const agent = roster.get(name);

  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    api<{ events: AgentEvent[] }>(`/api/agents/${encodeURIComponent(name)}`)
      .then((res) => {
        if (!cancelled) {
          setEvents(res.events);
          setNotFound(false);
        }
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [name, agent?.connected, agent?.status]);

  const typeColor = (type: AgentEvent["type"]) =>
    type === "connect" ? "text-sao-mint" : type === "disconnect" ? "text-red-400" : "text-sao-violet";

  return (
    <div className="flex flex-col gap-6">
      <Link to="/agents" className="self-start font-mono text-sm text-slate-400 transition-colors hover:text-sao-accent">
        ← agents
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl text-sao-accent">{name}</h1>
        {notFound ? (
          <p className="font-mono text-sm text-red-400">agent not found</p>
        ) : (
          <p className="font-mono text-sm text-slate-500">
            {agent ? (
              <>
                {agent.kind} · {agent.device} ·{" "}
                {agent.connected ? (
                  <span className={agent.status === "busy" ? "text-sao-violet" : "text-sao-mint"}>{agent.status}</span>
                ) : (
                  "offline"
                )}{" "}
                · last seen {agent.lastSeen ?? "never"}
              </>
            ) : (
              "loading…"
            )}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm tracking-widest text-sao-accent">RECENT EVENTS</h2>
        <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/60">
          {events.length === 0 ? (
            <p className="p-4 font-mono text-sm text-slate-500">no events yet</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="flex items-baseline gap-4 px-4 py-2 font-mono text-sm">
                <span className="text-slate-500">{ev.at}</span>
                <span className={typeColor(ev.type)}>{ev.type}</span>
                {ev.meta && <span className="text-slate-400">{ev.meta}</span>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
