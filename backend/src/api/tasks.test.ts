import { describe, expect, test } from "bun:test";
import type { TaskRow } from "@cardinal/core";
import { createDb } from "@cardinal/db";
import {
  handleClaimTask,
  handleCompleteTask,
  handleCreateTask,
  handleGetTask,
  handleListTasks,
} from "./tasks";

function jsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function createOpenTask(
  db: ReturnType<typeof createDb>,
  goal: string,
): Promise<{ id: string; status: string }> {
  const res = await handleCreateTask(db, jsonReq("http://localhost/api/tasks", "POST", { goal }));
  const body = (await res.json()) as { task: { id: string; status: string } };
  return body.task;
}

describe("handleListTasks", () => {
  test("DB vacía → {tasks: []}", async () => {
    const db = createDb(":memory:");
    const res = handleListTasks(db, new Request("http://localhost/api/tasks"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tasks: [] });
    db.close();
  });

  test("con tasks → lista ordenada por created_at", async () => {
    const db = createDb(":memory:");
    const first = await createOpenTask(db, "first");
    const second = await createOpenTask(db, "second");
    db.run("UPDATE tasks SET created_at = ? WHERE id = ?", ["2026-01-01 00:00:00", first.id]);
    db.run("UPDATE tasks SET created_at = ? WHERE id = ?", ["2026-01-02 00:00:00", second.id]);
    const res = handleListTasks(db, new Request("http://localhost/api/tasks"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string; goal: string }> };
    expect(body.tasks.map((t) => t.goal)).toEqual(["first", "second"]);
    db.close();
  });

  test("?status=open filtra por status", async () => {
    const db = createDb(":memory:");
    await createOpenTask(db, "open one");
    const done = await createOpenTask(db, "done one");
    await handleCompleteTask(
      db,
      done.id,
      jsonReq("http://localhost/api/tasks/x/complete", "PUT", {}),
    );
    const res = handleListTasks(db, new Request("http://localhost/api/tasks?status=open"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ goal: string }> };
    expect(body.tasks.map((t) => t.goal)).toEqual(["open one"]);
    db.close();
  });

  test("?status inválido → 400 {error: 'invalid_status'}", async () => {
    const db = createDb(":memory:");
    const res = handleListTasks(db, new Request("http://localhost/api/tasks?status=foo"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_status" });
    db.close();
  });
});

describe("handleCreateTask", () => {
  test("válido → 200 con id + status 'open'", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateTask(
      db,
      jsonReq("http://localhost/api/tasks", "POST", { goal: "do the thing" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: Record<string, unknown> };
    expect(typeof body.task.id).toBe("string");
    expect((body.task.id as string).length).toBeGreaterThan(0);
    expect(body.task).toMatchObject({
      goal: "do the thing",
      status: "open",
      created_by: "system",
      assigned_to: null,
      parent_id: null,
      summary: null,
      artifact_ref: null,
    });
    db.close();
  });

  test("goal ausente → 400 {error: 'missing_goal'}", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateTask(db, jsonReq("http://localhost/api/tasks", "POST", {}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_goal" });
    db.close();
  });

  test("goal vacío → 400 {error: 'missing_goal'}", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateTask(
      db,
      jsonReq("http://localhost/api/tasks", "POST", { goal: "" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_goal" });
    db.close();
  });

  test("goal solo espacios → 400 {error: 'missing_goal'}", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateTask(
      db,
      jsonReq("http://localhost/api/tasks", "POST", { goal: "   " }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_goal" });
    db.close();
  });

  test("parent_id inexistente → 400 {error: 'parent_not_found'}", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateTask(
      db,
      jsonReq("http://localhost/api/tasks", "POST", { goal: "orphan", parent_id: "missing" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "parent_not_found" });
    db.close();
  });

  test("body no JSON → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateTask(
      db,
      jsonReq("http://localhost/api/tasks", "POST", "no es json"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("createdByOverride ignora created_by del body", async () => {
    const db = createDb(":memory:");
    const res = await handleCreateTask(
      db,
      jsonReq("http://localhost/api/tasks", "POST", { goal: "spoof", created_by: "kirito" }),
      undefined,
      "shinon",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { created_by: string } };
    expect(body.task.created_by).toBe("shinon");
    db.close();
  });
});

describe("handleGetTask", () => {
  test("desconocida → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = handleGetTask(db, "nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("conocida → 200 con {task}", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "known goal");
    const res = handleGetTask(db, created.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: Record<string, unknown> };
    expect(body.task).toMatchObject({ id: created.id, goal: "known goal", status: "open" });
    db.close();
  });
});

describe("handleClaimTask", () => {
  test("open → 200 claimed + assigned_to", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "claim me");
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "shinon" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: Record<string, unknown> };
    expect(body.task).toMatchObject({
      id: created.id,
      status: "claimed",
      assigned_to: "shinon",
    });
    db.close();
  });

  test("desconocida → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = await handleClaimTask(
      db,
      "missing",
      jsonReq("http://localhost/api/tasks/missing/claim", "PUT", { by: "shinon" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("ya claimed → 409 {error: 'not_open'}", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "claimed already");
    await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "shinon" }),
    );
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "kirito" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_open" });
    db.close();
  });

  test("ya done → 409 {error: 'not_open'}", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "done already");
    await handleCompleteTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/complete", "PUT", {}),
    );
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "shinon" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_open" });
    db.close();
  });

  test("sin by → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "needs by");
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", {}),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("by solo espacios → 400 {error: 'bad_request'}", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "needs by");
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "   " }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    db.close();
  });

  test("byOverride ignora by del body", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "claim override");
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "kirito" }),
      undefined,
      "shinon",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { assigned_to: string } };
    expect(body.task.assigned_to).toBe("shinon");
    db.close();
  });

  test("byOverride permite omitir by", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "claim omit by");
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", {}),
      undefined,
      "shinon",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { assigned_to: string } };
    expect(body.task.assigned_to).toBe("shinon");
    db.close();
  });
});

describe("handleCompleteTask", () => {
  test("→ 200 done con summary + artifact_ref", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "finish me");
    const res = await handleCompleteTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/complete", "PUT", {
        summary: "did it",
        artifact_ref: "notes/result.md",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: Record<string, unknown> };
    expect(body.task).toMatchObject({
      id: created.id,
      status: "done",
      summary: "did it",
      artifact_ref: "notes/result.md",
    });
    db.close();
  });

  test("desconocida → 404 {error: 'not_found'}", async () => {
    const db = createDb(":memory:");
    const res = await handleCompleteTask(
      db,
      "missing",
      jsonReq("http://localhost/api/tasks/missing/complete", "PUT", { summary: "x" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    db.close();
  });

  test("sin body → 200 (summary null)", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "no body");
    const res = await handleCompleteTask(
      db,
      created.id,
      new Request("http://localhost/api/tasks/x/complete", { method: "PUT" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: Record<string, unknown> };
    expect(body.task).toMatchObject({
      id: created.id,
      status: "done",
      summary: null,
    });
    db.close();
  });

  test("actorAgent completando task de otro → 403 {error: 'forbidden'}", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "not yours");
    await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "kirito" }),
    );
    const res = await handleCompleteTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/complete", "PUT", { summary: "nope" }),
      undefined,
      "shinon",
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    db.close();
  });

  test("actorAgent completando task open/sin claim → 403 {error: 'forbidden'}", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "unclaimed");
    const res = await handleCompleteTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/complete", "PUT", { summary: "nope" }),
      undefined,
      "shinon",
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    db.close();
  });

  test("actorAgent completando la task que claimó → 200 done", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "mine");
    await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "shinon" }),
    );
    const res = await handleCompleteTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/complete", "PUT", { summary: "did it" }),
      undefined,
      "shinon",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { status: string } };
    expect(body.task.status).toBe("done");
    db.close();
  });
});

describe("tasks status CHECK", () => {
  test("acepta todos los status válidos y rechaza uno inválido", () => {
    const db = createDb(":memory:");
    for (const status of ["open", "claimed", "done", "blocked"] as const) {
      db.run("INSERT INTO tasks (id, goal, created_by, status) VALUES (?, ?, ?, ?)", [
        `task-${status}`,
        "goal",
        "system",
        status,
      ]);
    }
    const rows = db.query("SELECT status FROM tasks ORDER BY id").all() as Array<{ status: string }>;
    expect(rows.map((r) => r.status)).toEqual(["blocked", "claimed", "done", "open"]);

    expect(() =>
      db.run("INSERT INTO tasks (id, goal, created_by, status) VALUES (?, ?, ?, ?)", [
        "task-invalid",
        "goal",
        "system",
        "invalid",
      ]),
    ).toThrow();
    db.close();
  });
});

describe("onChange callback", () => {
  test("create llama onChange con la task creada", async () => {
    const db = createDb(":memory:");
    const calls: TaskRow[] = [];
    const res = await handleCreateTask(
      db,
      jsonReq("http://localhost/api/tasks", "POST", { goal: "notify" }),
      (t) => calls.push(t),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ goal: "notify", status: "open", created_by: "system" });
    db.close();
  });

  test("claim llama onChange con la task claimada", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "claim notify");
    const calls: TaskRow[] = [];
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "shinon" }),
      (t) => calls.push(t),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: created.id, status: "claimed", assigned_to: "shinon" });
    db.close();
  });

  test("complete llama onChange con la task completada", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "complete notify");
    const calls: TaskRow[] = [];
    const res = await handleCompleteTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/complete", "PUT", { summary: "done" }),
      (t) => calls.push(t),
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ id: created.id, status: "done", summary: "done" });
    db.close();
  });

  test("claim fallido (not_open) NO llama onChange", async () => {
    const db = createDb(":memory:");
    const created = await createOpenTask(db, "already done");
    await handleCompleteTask(db, created.id, jsonReq("http://localhost/api/tasks/x/complete", "PUT", {}));
    const calls: TaskRow[] = [];
    const res = await handleClaimTask(
      db,
      created.id,
      jsonReq("http://localhost/api/tasks/x/claim", "PUT", { by: "shinon" }),
      (t) => calls.push(t),
    );
    expect(res.status).toBe(409);
    expect(calls).toHaveLength(0);
    db.close();
  });
});
