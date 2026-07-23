import { useEffect, useState } from "react";
import type { AgentPayload } from "../lib/types";
import { connectRoster } from "../lib/ws";

export function useRoster(): Map<string, AgentPayload> {
  const [agents, setAgents] = useState<Map<string, AgentPayload>>(new Map());

  useEffect(() => {
    const disconnect = connectRoster((ev) => {
      setAgents((prev) => {
        const next = new Map(prev);
        if (ev.type === "roster") {
          next.clear();
          for (const agent of ev.agents) next.set(agent.name, agent);
        } else if (ev.type === "agent_update") {
          next.set(ev.agent.name, ev.agent);
        }
        return next;
      });
    });
    return disconnect;
  }, []);

  return agents;
}
