import { createMcpServer } from "./server";

const backendUrl = process.env.CARDINAL_BACKEND_URL;
if (!backendUrl) {
  console.error("CARDINAL_BACKEND_URL is required");
  process.exit(1);
}

const vaultsRoot = process.env.CARDINAL_VAULTS_ROOT;
if (!vaultsRoot) {
  console.error("CARDINAL_VAULTS_ROOT is required");
  process.exit(1);
}

const knownVaults = (process.env.CARDINAL_VAULTS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter((v) => v.length > 0);

const serviceKey = process.env.CARDINAL_SERVICE_KEY ?? "";

const mcp = createMcpServer({ backendUrl, vaultsRoot, knownVaults, serviceKey });
mcp.start();
