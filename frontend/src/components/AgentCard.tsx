import { Link } from "react-router-dom";
import type { AgentPayload } from "../lib/types";

export function hueFor(name: string): number {
  let h = 0;
  for (const c of name) {
    h = (h * 31 + c.charCodeAt(0)) % 360;
  }
  return h;
}

export default function AgentCard({ agent }: { agent: AgentPayload }) {
  const hue = hueFor(agent.name);
  const offline = !agent.connected;

  return (
    <Link
      to={`/agents/${encodeURIComponent(agent.name)}`}
      className={`flex flex-col items-center gap-3 rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-5 transition-colors hover:border-sao-accent/60 ${
        offline ? "opacity-40 grayscale" : ""
      }`}
    >
      <div
        className="h-16 w-16 rounded-full border-2"
        style={{
          borderColor: `hsl(${hue} 80% 60%)`,
          background: `radial-gradient(circle at 35% 35%, hsl(${hue} 80% 60% / 0.6), hsl(${hue} 80% 30% / 0.2))`,
          boxShadow: agent.connected ? `0 0 18px hsl(${hue} 80% 60% / 0.55)` : undefined,
        }}
      />
      <span className="font-mono text-sm text-slate-200">{agent.name}</span>
      <span className="font-mono text-xs text-slate-500">
        {agent.device} ·{" "}
        {agent.connected ? (
          <span className={agent.status === "busy" ? "text-sao-violet" : "text-sao-mint"}>{agent.status}</span>
        ) : (
          <span>offline</span>
        )}
      </span>
    </Link>
  );
}
