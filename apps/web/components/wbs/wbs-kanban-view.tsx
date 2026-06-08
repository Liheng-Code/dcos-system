"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Users, CircleDot, Clock3, ShieldCheck, UserCheck, ThumbsUp, Ban, Bell } from "lucide-react";
import { type WbsTaskRecord } from "@/components/wbs/wbs-types";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";

interface WbsKanbanViewProps {
  tasks: WbsTaskRecord[];
  onEdit: (task: WbsTaskRecord) => void;
}

function statusClass(status: string) {
  if (status === "ok" || status === "on_track") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "delayed" || status === "blocked") return "bg-red-50 text-red-700 border-red-200";
  if (status === "risk" || status === "high") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "completed") return "bg-slate-100 text-slate-500 border-slate-300";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full bg-slate-900" style={{ width: `${value}%` }} />
    </div>
  );
}

function KanbanCard({ task, hasAlert, onEdit }: { task: WbsTaskRecord; hasAlert: boolean; onEdit: (t: WbsTaskRecord) => void }) {
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-white p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow",
        hasAlert ? "border-red-300" : "border-slate-200",
        (task.status === "completed" || task.status === "closed" || task.status === "cancelled" || task.status === "approved") && "opacity-60",
      )}
      onClick={() => onEdit(task)}
    >
      {hasAlert && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 ring-2 ring-white">
          <Bell className="h-2.5 w-2.5 text-white" />
        </span>
      )}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn("text-xs font-medium truncate", (task.status === "completed" || task.status === "closed" || task.status === "cancelled") && "line-through")}>{task.task_name}</div>
          <div className="text-[10px] text-slate-500">{task.task_code}</div>
        </div>
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0", statusClass(task.priority))}>
          {task.priority}
        </span>
      </div>
      <ProgressBar value={task.progress} />
      <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{task.owner_name ?? "—"}</span>
        <span>{task.end_date ?? "—"}</span>
      </div>
      <div className="mt-2 flex gap-1.5 text-[10px]">
        {task.discipline && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5">{task.discipline}</span>
        )}
        {task.delay_status !== "on_track" && (
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px]", statusClass(task.delay_status))}>
            {task.delay_status}
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5">{task.photos_count} photos</span>
      </div>
    </div>
  );
}

function getKanbanStatus(task: WbsTaskRecord) {
  if (task.status === "completed" || task.status === "closed" || task.status === "cancelled") return "completed";
  if (task.status === "approved") return "approved";
  if (task.status === "submitted" || task.status === "review") return "pending_approval";
  if (task.status === "in_progress" || task.status === "paused" || task.status === "blocked" || task.status === "rejected") return "in_progress";
  if (task.status === "assigned") return "assigned";
  return "open";
}

export function WbsKanbanView({ tasks, onEdit }: WbsKanbanViewProps) {
  const { unreadTaskIds } = useTaskAlerts();
  const columns = useMemo(() => [
    { key: "open", title: "Open", icon: CircleDot, items: tasks.filter((t) => getKanbanStatus(t) === "open") },
    { key: "assigned", title: "Assigned", icon: UserCheck, items: tasks.filter((t) => getKanbanStatus(t) === "assigned") },
    { key: "in_progress", title: "In Progress", icon: Clock3, items: tasks.filter((t) => getKanbanStatus(t) === "in_progress") },
    { key: "pending_approval", title: "Pending Approval", icon: ShieldCheck, items: tasks.filter((t) => getKanbanStatus(t) === "pending_approval") },
    { key: "approved", title: "Approved", icon: ThumbsUp, items: tasks.filter((t) => getKanbanStatus(t) === "approved") },
    { key: "completed", title: "Completed", icon: Ban, items: tasks.filter((t) => getKanbanStatus(t) === "completed") },
  ], [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <p className="text-xs">No tasks to display on Kanban</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-[900px] grid-cols-6 gap-2">
      {columns.map((col) => {
        const Icon = col.icon;
        return (
          <div key={col.key} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Icon className="h-3.5 w-3.5" />
                {col.title}
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500">{col.items.length}</span>
            </div>
            <div className="space-y-2">
              {col.items.length > 0 ? (
                col.items.map((task) => <KanbanCard key={task.id} task={task} hasAlert={unreadTaskIds.has(task.id)} onEdit={onEdit} />)
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-[10px] text-slate-400">
                  Drop task here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
