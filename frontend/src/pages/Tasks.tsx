import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { TaskPayload } from "../lib/types";
import { connectRoster } from "../lib/ws";
import { useAuth } from "../hooks/useAuth";

/** Raw shape from GET/POST/PUT `/api/tasks` (snake_case TaskRow). */
interface TaskRowJson {
  id: string;
  goal: string;
  status: TaskPayload["status"];
  assigned_to: string | null;
  created_by: string;
  parent_id: string | null;
  summary: string | null;
  artifact_ref: string | null;
  created_at: string;
  updated_at: string | null;
}

function taskFromRow(row: TaskRowJson): TaskPayload {
  return {
    id: row.id,
    goal: row.goal,
    status: row.status,
    assignedTo: row.assigned_to,
    createdBy: row.created_by,
    parentId: row.parent_id,
    summary: row.summary,
    artifactRef: row.artifact_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function upsertTask(list: TaskPayload[], task: TaskPayload): TaskPayload[] {
  const idx = list.findIndex((item) => item.id === task.id);
  if (idx === -1) return [...list, task];
  const next = list.slice();
  next[idx] = task;
  return next;
}

function fmtWhen(value: string | null): string {
  return value ?? "never";
}

function statusClass(status: TaskPayload["status"]): string {
  if (status === "open") return "text-sao-accent";
  if (status === "claimed") return "text-sao-violet";
  if (status === "blocked") return "text-red-400";
  return "text-slate-500";
}

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskPayload[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showHistory, setShowHistory] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ tasks: TaskRowJson[] }>("/api/tasks")
      .then((res) => {
        if (!cancelled) {
          setTasks(res.tasks.map(taskFromRow));
          setLoadStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("failed to load tasks");
          setLoadStatus("error");
        }
      });

    const disconnect = connectRoster((ev) => {
      if (ev.type !== "task_update") return;
      setTasks((prev) => upsertTask(prev, ev.task));
    });

    return () => {
      cancelled = true;
      disconnect();
    };
  }, []);

  const live = tasks.filter((task) => task.status !== "done");
  const history = tasks.filter((task) => task.status === "done");

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = goal.trim();
    if (trimmed.length === 0) return;
    setError(null);
    try {
      const res = await api<{ task: TaskRowJson }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ goal: trimmed, created_by: user ?? "system" }),
      });
      setTasks((prev) => upsertTask(prev, taskFromRow(res.task)));
      setGoal("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "create failed");
    }
  }

  async function claim(id: string): Promise<void> {
    setError(null);
    if (!user) {
      setError("claim failed");
      return;
    }
    try {
      const res = await api<{ task: TaskRowJson }>(`/api/tasks/${id}/claim`, {
        method: "PUT",
        body: JSON.stringify({ by: user }),
      });
      setTasks((prev) => upsertTask(prev, taskFromRow(res.task)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "claim failed");
    }
  }

  async function confirmComplete(id: string): Promise<void> {
    setError(null);
    try {
      const res = await api<{ task: TaskRowJson }>(`/api/tasks/${id}/complete`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      setTasks((prev) => upsertTask(prev, taskFromRow(res.task)));
      setPendingId(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "complete failed";
      setError(message);
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg tracking-widest text-sao-accent">TASKS</h1>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-label="pasadas"
          title="pasadas"
          className={`rounded border p-1.5 text-slate-500 transition-colors hover:border-sao-accent/40 hover:text-sao-accent ${
            showHistory ? "border-sao-accent/60 text-sao-accent" : "border-transparent"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.25" />
            <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.25" />
          </svg>
        </button>
      </div>

      <form onSubmit={(e) => void onCreate(e)} className="flex flex-wrap gap-2">
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="goal"
          className="min-w-48 flex-1 rounded border border-sao-accent/20 bg-sao-bg px-3 py-2 font-mono text-sm outline-none focus:border-sao-accent"
        />
        <button
          type="submit"
          className="rounded border border-sao-accent bg-sao-accent/10 px-3 py-2 font-mono text-sm text-sao-accent transition-colors hover:bg-sao-accent/20"
        >
          crear
        </button>
      </form>

      {error && <p className="font-mono text-sm text-red-400">{error}</p>}

      {loadStatus === "ready" && live.length === 0 ? (
        <p className="rounded-lg border border-sao-accent/20 bg-sao-panel/60 p-6 font-mono text-sm text-slate-500">
          no open tasks — create one above
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/60">
          {live.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              pendingId={pendingId}
              onClaim={() => void claim(task.id)}
              onAskComplete={() => setPendingId(task.id)}
              onConfirmComplete={() => void confirmComplete(task.id)}
              onCancelComplete={() => setPendingId(null)}
            />
          ))}
        </div>
      )}

      {showHistory && (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-xs tracking-widest text-slate-500">PASADAS</h2>
          {history.length === 0 ? (
            <p className="font-mono text-sm text-slate-600">no completed tasks</p>
          ) : (
            <div className="flex flex-col divide-y divide-sao-accent/10 rounded-lg border border-sao-accent/20 bg-sao-panel/40">
              {history.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 font-mono text-sm text-slate-500"
                >
                  <span className={statusClass(task.status)}>{task.status}</span>
                  <span>{task.goal}</span>
                  <span>{task.assignedTo ?? "unassigned"}</span>
                  <span>done {fmtWhen(task.updatedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TaskRow({
  task,
  pendingId,
  onClaim,
  onAskComplete,
  onConfirmComplete,
  onCancelComplete,
}: {
  task: TaskPayload;
  pendingId: string | null;
  onClaim: () => void;
  onAskComplete: () => void;
  onConfirmComplete: () => void;
  onCancelComplete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 font-mono text-sm">
      <span className={statusClass(task.status)}>{task.status}</span>
      <span className="text-sao-accent">{task.goal}</span>
      <span className="text-slate-400">{task.assignedTo ?? "unassigned"}</span>
      <span className="text-slate-500">by {task.createdBy}</span>
      <span className="text-slate-500">created {fmtWhen(task.createdAt)}</span>
      <span className="ml-auto">
        {pendingId === task.id ? (
          <span className="flex gap-2">
            <button type="button" onClick={onConfirmComplete} className="text-red-400 hover:text-red-300">
              sí
            </button>
            <button type="button" onClick={onCancelComplete} className="text-slate-500 hover:text-sao-accent">
              no
            </button>
          </span>
        ) : (
          <span className="flex gap-3">
            {task.status === "open" && (
              <button type="button" onClick={onClaim} className="text-sao-violet hover:text-sao-accent">
                claimar
              </button>
            )}
            {task.status !== "done" && (
              <button type="button" onClick={onAskComplete} className="text-sao-violet hover:text-sao-accent">
                completar
              </button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
