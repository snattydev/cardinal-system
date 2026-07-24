import { useState } from "react";
import AgentCard from "../components/AgentCard";
import { useRoster } from "../hooks/useRoster";

export default function Agents() {
  const roster = useRoster();
  const [showSubs, setShowSubs] = useState(false);

  const agents = [...roster.values()]
    .filter((a) => a.kind === "agent")
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  const subs = [...roster.values()].filter((a) => a.kind === "subagent");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-mono text-lg tracking-widest text-sao-accent">AGENT HUB</h1>

      {agents.length === 0 ? (
        <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6 font-mono text-sm text-slate-500">
          no external agents registered — create a key with{" "}
          <span className="text-sao-accent">bun run keygen -- --agent &lt;name&gt;</span>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </div>
      )}

      {subs.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowSubs((v) => !v)}
            className="self-start font-mono text-sm text-slate-400 transition-colors hover:text-sao-accent"
          >
            {showSubs ? "▾" : "▸"} subagents ({subs.length})
          </button>
          {showSubs && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {subs.map((agent) => (
                <AgentCard key={agent.name} agent={agent} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
