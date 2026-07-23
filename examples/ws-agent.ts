/**
 * examples/ws-agent.ts — REFERENCE WebSocket client for the Cardinal agent protocol.
 *
 * THIS IS NOT AN SDK. It is the minimal, generic example of how any agent (in
 * any language, with any standard WebSocket client) talks to the Cardinal:
 *
 *   1. Open a WebSocket to CARDINAL_URL (default ws://localhost:8787/ws).
 *   2. Send `hello` carrying the agent API key — the key IS the identity, the
 *      Cardinal derives the agent name from it (no name field is ever sent).
 *   3. Answer every server `ping` with a `pong` (2 missed pings → dropped).
 *   4. Log `welcome` (assigned name + kind) and `error` messages.
 *   5. If the connection drops, reconnect with linear backoff: min(15000, 500 * attempt).
 *   6. On SIGINT/SIGTERM send `bye`, close with code 1000 and exit 0.
 *
 * Usage:
 *   CARDINAL_AGENT_KEY=sk-cardinal-... CARDINAL_DEVICE=pc bun examples/ws-agent.ts
 */

const CARDINAL_URL = process.env.CARDINAL_URL ?? "ws://localhost:8787/ws";
const CARDINAL_AGENT_KEY = process.env.CARDINAL_AGENT_KEY;
const CARDINAL_DEVICE = process.env.CARDINAL_DEVICE ?? "localhost";

if (!CARDINAL_AGENT_KEY) {
  console.error(
    "[agent] CARDINAL_AGENT_KEY is required (create one with: bun run keygen -- --agent <name>)",
  );
  process.exit(1);
}

let ws: WebSocket | null = null;
let attempt = 0;
let shuttingDown = false;

function send(msg: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect(): void {
  console.log(`[agent] connecting to ${CARDINAL_URL} (attempt ${attempt + 1})`);
  ws = new WebSocket(CARDINAL_URL);

  ws.onopen = () => {
    attempt = 0;
    send({ type: "hello", key: CARDINAL_AGENT_KEY, device: CARDINAL_DEVICE, status: "idle" });
  };

  ws.onmessage = (ev) => {
    let msg: any;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      console.warn("[agent] ignoring non-JSON message:", String(ev.data));
      return;
    }
    switch (msg.type) {
      case "welcome":
        console.log(`[agent] welcome as ${msg.agent} (${msg.kind})`);
        break;
      case "ping":
        send({ type: "pong", status: "idle" });
        break;
      case "error":
        console.error(`[agent] server error: ${msg.reason}`);
        break;
      default:
        console.log("[agent] message:", msg);
    }
  };

  ws.onclose = (ev) => {
    console.log(`[agent] closed (code=${ev.code}${ev.reason ? ` reason=${ev.reason}` : ""})`);
    if (shuttingDown) return;
    attempt += 1;
    const delay = Math.min(15000, 500 * attempt);
    console.log(`[agent] reconnecting in ${delay}ms`);
    setTimeout(connect, delay);
  };

  ws.onerror = () => {
    // onclose handles reconnection; this handler only prevents an uncaught throw.
  };
}

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[agent] shutting down: sending bye");
  send({ type: "bye" });
  setTimeout(() => {
    ws?.close(1000, "bye");
    process.exit(0);
  }, 100);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

connect();
