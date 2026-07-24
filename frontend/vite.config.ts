import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Proxy targets: override with VITE_API_URL / VITE_WS_URL env vars when running
// under podman-compose (where the backend is reachable via service name).
// Falls back to localhost:8787 for native dev (bun run dev:backend + dev:frontend).
const API_URL = process.env.VITE_API_URL ?? "http://localhost:8787";
const WS_URL = process.env.VITE_WS_URL ?? "ws://localhost:8787";

// Listen on 0.0.0.0 inside containers so the host can reach the Vite dev server
// through the published port. Falls back to localhost for native dev.
const HOST = process.env.VITE_HOST ?? "localhost";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: HOST,
    proxy: {
      "/api": API_URL,
      "/ws": {
        target: WS_URL,
        ws: true,
      },
    },
  },
});
