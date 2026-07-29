import { useEffect, useState } from "react";
import { api } from "./api";
import type { SystemInfo } from "./types";
import { fmtUptime } from "./types";

interface SystemState {
  info: SystemInfo;
  uptimeDisplay: string;
}

const MOCK_INFO: SystemInfo = {
  version: "0.1.1",
  uptime_seconds: 0,
  db_size_bytes: 0,
  agents_total: 0,
  agents_online: 0,
  keys_active: 0,
  keys_revoked: 0,
};

export function useSystem(): SystemState {
  const [info, setInfo] = useState<SystemInfo>(MOCK_INFO);
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    api<SystemInfo>("/api/system")
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setUptimeSeconds(data.uptime_seconds);
        intervalId = setInterval(() => {
          setUptimeSeconds((n) => n + 1);
        }, 1000);
        if (cancelled) clearInterval(intervalId);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, []);

  const uptimeDisplay = uptimeSeconds > 0 ? fmtUptime(uptimeSeconds) : "—";

  return { info, uptimeDisplay };
}
