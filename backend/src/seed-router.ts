import { createDb } from "@cardinal/db";
import { addProviderModel, createAgentKey, registerAgent, upsertModelRoute, upsertProvider } from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";

// Seed del router para e2e local (mock upstream en host:18999).
// Uso: podman exec cardinal-backend sh -c 'cd /app && bun backend/src/seed-router.ts'
// Imprime la key derivada UNA vez (guardarla).

const db = createDb(process.env.DB_PATH ?? "/data/cardinal.db");

upsertProvider(db, {
  name: "mock-local",
  baseUrl: "http://host.containers.internal:18999/v1",
  apiKeyEnc: null,
  wireFormat: "openai",
  status: "active",
  rpmLimit: null,
  tpmLimit: null,
  costPerMtok: 0,
});
const provider = db.query("SELECT id FROM providers WHERE name = ?").get("mock-local") as { id: number };
addProviderModel(db, {
  providerId: provider.id,
  modelId: "test-model",
  capabilities: JSON.stringify(["chat", "streaming"]),
  contextWindow: 4096,
});
upsertModelRoute(db, "fast", [{ provider: "mock-local", model: "test-model" }]);

registerAgent(db, "e2e-client", "agent");
const key = generateKey();
createAgentKey(db, {
  keyHash: hashKey(key),
  agentName: "e2e-client",
  createdBy: "human",
  scopes: ["fast"],
  budgetLimit: 1000,
});

console.log("KEY=" + key);
console.log(
  "providers:",
  (db.query("SELECT name, base_url FROM providers").all() as { name: string }[]).map((r) => r.name).join(", "),
);
console.log(
  "routes:",
  (db.query("SELECT alias FROM model_routes").all() as { alias: string }[]).map((r) => r.alias).join(", "),
);
db.close();
