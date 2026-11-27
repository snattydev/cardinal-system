import { createDb } from "@cardinal/db";
import { createAgentKey, registerAgent } from "@cardinal/db";
import { generateKey, hashKey } from "@cardinal/keys";

// e2e del router: key en memoria (nunca se imprime), llama al endpoint HTTP real
// del backend del container y verifica completion + metering + failover.
// Uso: podman exec cardinal-backend sh -c 'cd /app && bun backend/src/e2e-router.ts'

const db = createDb(process.env.DB_PATH ?? "/data/cardinal.db");
const key = generateKey();
registerAgent(db, "e2e-run", "agent");
createAgentKey(db, {
  keyHash: hashKey(key),
  agentName: "e2e-run",
  createdBy: "human",
  scopes: ["fast"],
  budgetLimit: 1000,
});

const BASE = "http://127.0.0.1:8787";
const results: string[] = [];

// 1. /v1/models — list available models (OpenAI format)
{
  const r = await fetch(`${BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const j = (await r.json()) as { object: string; data: { id: string }[] };
  results.push(`GET /v1/models → ${r.status} object=${j.object} models=[${j.data.map((m) => m.id).join(", ")}]`);
}

// 2. POST /v1/chat/completions con la key derivada (scope fast) → completion real
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "fast", messages: [{ role: "user", content: "ping" }] }),
  });
  const text = await r.text();
  const j = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
  const choice = (j.choices as { message?: { content?: string } }[] | undefined)?.[0];
  results.push(`POST /v1/chat/completions (alias fast) → ${r.status} content=${choice?.message?.content ?? JSON.stringify(j)}`);
}

// 3. Sin auth → 401
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "fast", messages: [{ role: "user", content: "ping" }] }),
  });
  results.push(`sin Bearer → ${r.status}`);
}

// 4. Streaming SSE
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "fast", messages: [{ role: "user", content: "ping" }], stream: true }),
  });
  const text = await r.text();
  const hasDone = text.includes("[DONE]");
  results.push(`stream → ${r.status} content-type=${r.headers.get("content-type")} has[DONE]=${hasDone} bytes=${text.length}`);
}

// 5. Metering: budget_used de la key tras 2 llamadas (15 tokens c/u del mock)
{
  const row = db.query("SELECT budget_used, budget_limit, revoked_at FROM agent_keys WHERE agent_name = ?").get("e2e-run") as {
    budget_used: number;
    budget_limit: number | null;
    revoked_at: string | null;
  };
  results.push(`metering: budget_used=${row.budget_used}/${row.budget_limit} revoked=${row.revoked_at ?? "no"}`);
}

// 6. usage_log: filas por provider
{
  const rows = db.query("SELECT provider_name, model_id, total_tokens FROM usage_log ORDER BY id").all() as {
    provider_name: string;
    model_id: string;
    total_tokens: number;
  }[];
  results.push(`usage_log: ${rows.length} fila(s) → ${rows.map((r) => `${r.provider_name}/${r.model_id}=${r.total_tokens}t`).join(", ")}`);
}

// 7. Modelo inexistente → 404
{
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "no-existe", messages: [{ role: "user", content: "ping" }] }),
  });
  results.push(`model inexistente → ${r.status}`);
}

console.log(results.join("\n"));
db.close();
