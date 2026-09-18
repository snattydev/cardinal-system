import { Link } from "react-router-dom";
import type { AgentPayload } from "../lib/types";
import { Card, Badge } from "./ui";

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
    <Link to={`/agents/${encodeURIComponent(agent.name)}`} className="block">
      <Card
        variant="interactive"
        className={`flex flex-col items-center gap-3 p-5 text-center ${
          offline ? "opacity-35 grayscale hover:opacity-50" : ""
        }`}
      >
        <div
          className="h-16 w-16 rounded-full border-2 transition-transform duration-200"
          style={{
            borderColor: `hsl(${hue} 80% 60%)`,
            background: `radial-gradient(circle at 35% 35%, hsl(${hue} 80% 60% / 0.6), hsl(${hue} 80% 30% / 0.2))`,
            boxShadow: agent.connected
              ? `0 0 20px hsl(${hue} 80% 60% / 0.45)`
              : undefined,
          }}
        />
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-sm font-semibold tracking-wide text-sao-text">
            {agent.name}
          </span>
          <span className="font-mono text-xs text-sao-muted">
            {agent.device}
          </span>
        </div>
        <div className="mt-1">
          {!agent.connected ? (
            <Badge variant="neutral">offline</Badge>
          ) : agent.status === "busy" ? (
            <Badge variant="underworld" dot>
              busy
            </Badge>
          ) : (
            <Badge variant="sinon" dot>
              {agent.status}
            </Badge>
          )}
        </div>
      </Card>
    </Link>
  );
}
