import React, { useState } from "react";
import { Loader2, CheckCircle2, XCircle, X, ChevronDown, ChevronUp, Cpu } from "lucide-react";
import {
  useBackgroundTaskStore,
  type BackgroundTask,
  type BackgroundTaskStatus,
} from "../../stores/background-task-store";

// ─── Single Task Row ──────────────────────────────────────────────────────────

const statusIcon: Record<BackgroundTaskStatus, React.ReactNode> = {
  running: <Loader2 size={12} className="animate-spin text-primary shrink-0" />,
  completed: <CheckCircle2 size={12} className="text-green-400 shrink-0" />,
  failed: <XCircle size={12} className="text-red-400 shrink-0" />,
  cancelled: <XCircle size={12} className="text-text-muted shrink-0" />,
};

const statusColor: Record<BackgroundTaskStatus, string> = {
  running: "bg-primary",
  completed: "bg-green-500",
  failed: "bg-red-500",
  cancelled: "bg-text-muted",
};

const TaskRow: React.FC<{ task: BackgroundTask }> = ({ task }) => {
  const cancelTask = useBackgroundTaskStore((s) => s.cancelTask);

  return (
    <div className="px-3 py-2 border-b border-white/5 last:border-0 group">
      <div className="flex items-center gap-2 mb-1">
        {statusIcon[task.status]}
        <span className="text-[11px] font-medium text-text-primary truncate flex-1">
          {task.name}
        </span>
        {task.status === "running" && task.cancel && (
          <button
            onClick={() => cancelTask(task.id)}
            title="Cancel task"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-400 text-text-muted rounded"
          >
            <X size={10} />
          </button>
        )}
      </div>

      <p className="text-[9px] text-text-muted truncate mb-1.5 pl-[20px]">
        {task.message || task.description}
      </p>

      {/* Progress bar — only show for running tasks */}
      {task.status === "running" && (
        <div className="pl-[20px]">
          <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${statusColor[task.status]}`}
              style={{ width: `${Math.max(3, task.progress)}%` }}
            />
          </div>
          <span className="text-[8px] text-text-muted font-mono mt-0.5 block">
            {task.progress}%
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Main Indicator ───────────────────────────────────────────────────────────

export const BackgroundTaskIndicator: React.FC = () => {
  const tasks = useBackgroundTaskStore((s) => s.tasks);
  const clearCompleted = useBackgroundTaskStore((s) => s.clearCompleted);
  const [expanded, setExpanded] = useState(true);

  if (tasks.length === 0) return null;

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const hasCompleted = tasks.some(
    (t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled",
  );

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-72 rounded-xl overflow-hidden shadow-2xl border border-white/10"
      style={{
        background: "rgba(15, 15, 20, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none border-b border-white/10"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Cpu size={12} className="text-primary shrink-0" />
          <span className="text-[11px] font-semibold text-text-primary">
            Background Tasks
          </span>
          {runningCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary/20 text-primary border border-primary/30">
              {runningCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasCompleted && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearCompleted();
              }}
              className="text-[9px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
          )}
          {expanded ? (
            <ChevronDown size={12} className="text-text-muted" />
          ) : (
            <ChevronUp size={12} className="text-text-muted" />
          )}
        </div>
      </div>

      {/* Task list */}
      {expanded && (
        <div className="max-h-60 overflow-y-auto">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Animated bottom bar for running tasks */}
      {runningCount > 0 && (
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-primary/60 via-primary to-primary/60 animate-pulse"
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
};
