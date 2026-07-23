import type { ServerEvent } from "./types";

export function connectRoster(onEvent: (ev: ServerEvent) => void): () => void {
  let disposed = false;
  let attempt = 0;
  let socket: WebSocket | null = null;

  function connect() {
    if (disposed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/ws`);

    socket.onopen = () => {
      attempt = 0;
      socket?.send(JSON.stringify({ type: "subscribe" }));
    };

    socket.onmessage = (msg) => {
      try {
        const ev = JSON.parse(String(msg.data)) as ServerEvent;
        onEvent(ev);
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      if (disposed) return;
      attempt += 1;
      setTimeout(connect, Math.min(15000, 1000 * attempt));
    };
  }

  connect();

  return () => {
    disposed = true;
    socket?.close();
  };
}
