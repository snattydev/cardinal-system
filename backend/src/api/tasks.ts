import type { Database } from "bun:sqlite";
import { json } from "@cardinal/core";
import type { TaskStatus, TaskRow } from "@cardinal/core";
import { claimTask, completeTask, createTask, getTask, listTasks } from "@cardinal/db";

const TASK_STATUSES: TaskStatus[] = ["open", "claimed", "done", "blocked"];

export function handleListTasks(db: Database, req: Request): Response {
  const statusParam = new URL(req.url).searchParams.get("status");
  if (statusParam !== null && !TASK_STATUSES.includes(statusParam as TaskStatus)) {
    return json({ error: "invalid_status" }, 400);
  }
  return json({ tasks: listTasks(db, (statusParam as TaskStatus) || undefined) });
}

export async function handleCreateTask(
  db: Database,
  req: Request,
  onChange?: (task: TaskRow) => void,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.goal !== "string" || raw.goal.trim().length === 0) {
    return json({ error: "missing_goal" }, 400);
  }

  const createdBy = typeof raw.created_by === "string" ? raw.created_by : "system";
  const parentId = typeof raw.parent_id === "string" ? raw.parent_id : null;
  if (parentId !== null && getTask(db, parentId) === null) {
    return json({ error: "parent_not_found" }, 400);
  }
  const task = createTask(db, { goal: raw.goal, createdBy, parentId });
  onChange?.(task);
  return json({ task });
}

export function handleGetTask(db: Database, id: string): Response {
  const task = getTask(db, id);
  if (!task) return json({ error: "not_found" }, 404);
  return json({ task });
}

export async function handleClaimTask(
  db: Database,
  id: string,
  req: Request,
  onChange?: (task: TaskRow) => void,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.by !== "string" || raw.by.trim().length === 0) {
    return json({ error: "bad_request" }, 400);
  }

  const task = claimTask(db, id, raw.by);
  if (!task) {
    return getTask(db, id) === null
      ? json({ error: "not_found" }, 404)
      : json({ error: "not_open" }, 409);
  }
  onChange?.(task);
  return json({ task });
}

export async function handleCompleteTask(
  db: Database,
  id: string,
  req: Request,
  onChange?: (task: TaskRow) => void,
): Promise<Response> {
  let summary: string | null = null;
  let artifactRef: string | null = null;
  try {
    const text = await req.text();
    if (text.trim().length > 0) {
      const body = JSON.parse(text) as unknown;
      const raw = (body ?? {}) as Record<string, unknown>;
      summary = typeof raw.summary === "string" ? raw.summary : null;
      artifactRef = typeof raw.artifact_ref === "string" ? raw.artifact_ref : null;
    }
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const task = completeTask(db, id, { summary, artifactRef });
  if (!task) return json({ error: "not_found" }, 404);
  onChange?.(task);
  return json({ task });
}
