import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { TaskPayload } from "../lib/types";
import { connectRoster } from "../lib/ws";
import { useAuth } from "../hooks/useAuth";
import { Card, Badge, Button, Input } from "../components/ui";
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

function TaskBadge({ status }: { status: TaskPayload["status"] }) {
  if (status === "open") return <Badge variant="sinon" dot>open</Badge>;
  if (status === "claimed") return <Badge variant="aincrad" dot>claimed</Badge>;
  if (status === "blocked") return <Badge variant="slash" dot>blocked</Badge>;
  return <Badge variant="neutral">done</Badge>;
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
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 font-mono text-lg tracking-widest text-sao-text">
          <span className="w-2 h-2 bg-sao-aincrad shadow-[0_0_8px_#FF7A00]"></span>
          <span>TASKS</span>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-label="history"
          title="Toggle completed history"
          className={`rounded-[2px] border p-2 font-mono text-xs uppercase tracking-wider transition-all duration-150 ${
            showHistory
              ? "border-sao-aincrad/50 bg-sao-elevated text-sao-aincrad shadow-[0_0_12px_rgba(255,122,0,0.12)]"
              : "border-white/10 text-sao-muted hover:border-white/20 hover:text-sao-text"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.25" />
              <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.25" />
            </svg>
            Archive
          </span>
        </button>
      </div>

      <form onSubmit={(e) => void onCreate(e)} className="flex flex-wrap gap-2">
        <Input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Define new task goal..."
          className="min-w-48 flex-1"
        />
        <Button type="submit" variant="primary">
          Create Task
        </Button>
      </form>

      {error && (
        <div className="border border-sao-slash-red/40 bg-[rgba(255,42,77,0.08)] px-4 py-2 font-mono text-xs text-sao-slash-red">
          {error}
        </div>
      )}

      {loadStatus === "ready" && live.length === 0 ? (
        <Card className="p-8 text-center font-mono text-sm text-sao-dim border-dashed">
          No active tasks — create one above.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
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
        <section className="mt-4 flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-sao-muted">
            <span className="w-1.5 h-1.5 bg-sao-dim inline-block"></span>
            Completed Archive
          </h2>
          {history.length === 0 ? (
            <Card className="p-6 text-center font-mono text-xs text-sao-dim">
              No completed tasks recorded.
            </Card>
          ) : (
            <div className="flex flex-col gap-1.5">
              {history.map((task) => (
                <div
                  key={task.id}
                  className="sao-panel flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 font-mono text-xs text-sao-muted"
                >
                  <div className="flex items-center gap-3">
                    <TaskBadge status={task.status} />
                    <span className="text-sao-text">{task.goal}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-sao-dim">
                    <span>assigned: {task.assignedTo ?? "unassigned"}</span>
                    <span>done {fmtWhen(task.updatedAt)}</span>
                  </div>
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
    <Card
      variant="interactive"
      className="flex flex-wrap items-center justify-between gap-4 p-3.5"
    >
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
        <TaskBadge status={task.status} />
        <span className="font-medium text-sao-text">{task.goal}</span>
        <span className="text-sao-dim">|</span>
        <span className="text-sao-muted">
          {task.assignedTo ? `agent: ${task.assignedTo}` : "unassigned"}
        </span>
        <span className="text-sao-dim">by {task.createdBy}</span>
        <span className="text-sao-dim">{fmtWhen(task.createdAt)}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {pendingId === task.id ? (
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-sao-muted">Mark complete?</span>
            <Button variant="danger" size="sm" onClick={onConfirmComplete}>
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelComplete}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {task.status === "open" && (
              <Button variant="secondary" size="sm" onClick={onClaim}>
                Claim
              </Button>
            )}
            {task.status !== "done" && (
              <Button variant="primary" size="sm" onClick={onAskComplete}>
                Complete
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
