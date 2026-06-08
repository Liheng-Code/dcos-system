"use client";

import { X, CalendarDays, User, Flag, GitBranch, AlertTriangle } from "lucide-react";
import type { GanttTask } from "./gantt-types";
import { formatDate, getStatusLabel, getDependencyLabel, diffDays } from "./gantt-utils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GanttTaskDetailDrawerProps {
  task: GanttTask | null;
  allTasks: GanttTask[];
  onClose: () => void;
  onEdit?: (taskId: string) => void;
}

export function GanttTaskDetailDrawer({ task, allTasks, onClose, onEdit }: GanttTaskDetailDrawerProps) {
  if (!task) return null;

  const predecessors = task.dependency_task_ids
    ?.map((id, i) => {
      const t = allTasks.find((at) => at.id === id);
      if (!t) return null;
      return {
        task: t,
        type: getDependencyLabel(task.dependency_types?.[i] || "FS"),
        lag: task.dependency_lag_days?.[i] || 0,
      };
    })
    .filter(Boolean) as { task: GanttTask; type: string; lag: number }[];

  const successors = allTasks.filter((at) =>
    at.dependency_task_ids?.includes(task.id)
  );

  const variance =
    task.baseline_finish_date && task.end_date
      ? diffDays(task.end_date, task.baseline_finish_date)
      : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/10" onClick={onClose} />
      <div className="relative w-80 bg-background border-l border-border shadow-xl h-full overflow-y-auto animate-in slide-in-from-right">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-background border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Task Details</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{task.task_code}</span>
              {task.is_milestone && <Flag className="h-3.5 w-3.5 text-amber-500" />}
              {task.constraint_type && <GitBranch className="h-3.5 w-3.5 text-blue-400" />}
            </div>
            <h2 className="mt-1 text-base font-semibold leading-snug">{task.task_name}</h2>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" className="text-[10px]">
              {getStatusLabel(task.status)}
            </Badge>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                task.delay_status === "on_track" && "bg-green-50 text-green-700 border-green-200",
                task.delay_status === "risk" && "bg-amber-50 text-amber-700 border-amber-200",
                task.delay_status === "delayed" && "bg-red-50 text-red-700 border-red-200",
                task.delay_status === "blocked" && "bg-slate-50 text-slate-600 border-slate-200",
              )}
            >
              {task.delay_status.replace(/_/g, " ")}
            </span>
            {task.is_critical && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" /> Critical
              </span>
            )}
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span className="font-semibold">{task.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-2 rounded-lg bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="font-semibold">Schedule</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[10px] text-muted-foreground">Start</div>
                <div className="font-medium">
                  {task.start_date ? formatDate(task.start_date) : "-"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Finish</div>
                <div className="font-medium">
                  {task.end_date ? formatDate(task.end_date) : "-"}
                </div>
              </div>
            </div>
            {variance !== null && variance !== 0 && (
              <div className={cn("text-[10px] font-semibold", variance > 0 ? "text-red-600" : "text-emerald-600")}>
                {variance > 0 ? "+" : ""}{variance}d vs baseline
              </div>
            )}
            {task.baseline_start_date && task.baseline_finish_date && (
              <div className="border-t border-border/50 pt-2 mt-2">
                <div className="text-[10px] text-muted-foreground mb-1">Baseline</div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>{formatDate(task.baseline_start_date)}</div>
                  <div>{formatDate(task.baseline_finish_date)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Owner */}
          {task.owner_name && (
            <div className="flex items-center gap-2 rounded-lg border border-border/50 p-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-[10px] text-muted-foreground">Owner</div>
                <div className="text-sm font-medium">{task.owner_name}</div>
              </div>
            </div>
          )}

          {/* Predecessors */}
          {predecessors.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Predecessors</h4>
              <div className="space-y-1.5">
                {predecessors.map((p) => (
                  <div
                    key={p.task.id}
                    className="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-xs"
                  >
                    <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-mono text-[10px] text-muted-foreground">{p.task.task_code}</span>
                    <span className="truncate">{p.task.task_name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {p.type}{p.lag > 0 ? `+${p.lag}d` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Successors */}
          {successors.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Successors</h4>
              <div className="space-y-1.5">
                {successors.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">{s.task_code}</span>
                    <span className="truncate">{s.task_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discipline */}
          {task.discipline && (
            <div className="text-xs">
              <span className="text-muted-foreground">Discipline: </span>
              <span className="font-medium">{task.discipline}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={() => onEdit?.(task.id)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
            >
              View Full Task Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
