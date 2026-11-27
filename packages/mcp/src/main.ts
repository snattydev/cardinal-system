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

const writableRoot = process.env.CARDINAL_WRITABLE_ROOT?.trim() || undefined;
const configsRoot = process.env.CARDINAL_CONFIGS_ROOT?.trim() || undefined;
const indexDbPath = process.env.CARDINAL_INDEX_DB?.trim() || "/tmp/cardinal-mcp-index.db";
const qmdUrl = process.env.QMD_URL?.trim() || undefined;
const internalServiceSecret = process.env.INTERNAL_SERVICE_SECRET?.trim() || undefined;

const denyPrefixes = (process.env.CARDINAL_DENY_PREFIXES ?? "personal")
  .split(",")
  .map((p) => p.trim())
  .filter((p) => p.length > 0);

const gitAutoCommit =
  (process.env.CARDINAL_GIT_AUTOCOMMIT ?? "true").trim().toLowerCase() !== "false";

const mcp = createMcpServer({
  backendUrl,
  vaultsRoot,
  writableRoot,
  configsRoot,
  indexDbPath,
  qmdUrl,
  internalServiceSecret,
  denyPrefixes,
  gitAutoCommit,
});

mcp.start();
