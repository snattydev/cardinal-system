import { describe, expect, test } from "bun:test";
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
    const res = handleListTasks(db);
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
    const res = handleListTasks(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tasks: Array<{ id: string; goal: string }> };
    expect(body.tasks.map((t) => t.goal)).toEqual(["first", "second"]);
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
