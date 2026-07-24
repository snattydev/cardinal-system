import { useEffect, useState } from "react";
import { api } from "./api";
import type { SystemInfo } from "./types";
import { fmtUptime } from "./types";

interface SystemState {
  info: SystemInfo;
  uptimeDisplay: string;
}

const MOCK_INFO: SystemInfo = {
  version: "0.0.1",
  uptime_seconds: 0,
  db_path: "—",
  db_size_bytes: 0,
  agents_total: 0,
  agents_online: 0,
  keys_active: 0,
  keys_revoked: 0,
};

// Module-level shared state — one counter for the whole app
let sharedBase = 0;
let timerStarted = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function startTimer() {
  if (timerStarted) return;
  timerStarted = true;
  setInterval(() => {
    if (sharedBase > 0) {
      sharedBase += 1;
      notify();
    }
  }, 1000);
}

export function useSystem(): SystemState {
  const [, setTick] = useState(0);
  const [info, setInfo] = useState<SystemInfo>(MOCK_INFO);

  useEffect(() => {
    api<SystemInfo>("/api/system")
      .then((data) => {
        setInfo(data);
        sharedBase = data.uptime_seconds;
        startTimer();
        notify();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const rerender = () => setTick((n) => n + 1);
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  const uptimeDisplay = sharedBase > 0 ? fmtUptime(sharedBase) : "—";

  return { info, uptimeDisplay };
}
