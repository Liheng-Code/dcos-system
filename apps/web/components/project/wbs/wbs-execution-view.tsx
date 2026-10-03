"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import { Users, UserCheck, GitBranch, FileText, Camera, MoreHorizontal, Copy, Pencil, Trash2, Bell, Loader2 } from "lucide-react";
import { type WbsTaskRecord } from "@/components/project/wbs/wbs-types";
import { insertWbsAuditLog, insertWbsTask, listWbsTasksByProjectId, updateWbsTaskById } from "@/lib/project/wbs/wbs-queries";
import { toast } from "sonner";
import { useTaskAlerts } from "@/components/dashboard/task-alerts-provider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface WbsExecutionViewProps {
  tasks: WbsTaskRecord[];
  taskAssignerNames: Record<string, string>;
  onEdit: (task: WbsTaskRecord) => void;
  onDelete: (task: WbsTaskRecord) => void;
  onRefresh: () => void;
}

function statusClass(status: string) {
  if (status === "on_track" || status === "open") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "delayed" || status === "blocked") return "bg-red-50 text-red-700 border-red-200";
  if (status === "risk" || status === "review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "in_progress") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "paused") return "bg-orange-50 text-orange-700 border-orange-200";
  if (status === "submitted") return "bg-purple-50 text-purple-700 border-purple-200";
  if (status === "cancelled") return "bg-slate-100 text-slate-500 border-slate-300 line-through";
  if (status === "closed" || status === "approved") return "bg-slate-100 text-slate-600 border-slate-200";
  if (status === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function delayClass(delay: string) {
  if (delay === "on_track") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (delay === "risk") return "bg-amber-50 text-amber-700 border-amber-200";
  if (delay === "delayed") return "bg-red-50 text-red-700 border-red-200";
  if (delay === "blocked") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function priorityClass(priority: string) {
  if (priority === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (priority === "high") return "bg-amber-50 text-amber-700 border-amber-200";
  if (priority === "medium") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function nextCopyCode(baseCode: string, existingCodes: Set<string>) {
  const firstCopy = `${baseCode}-copy`;
  if (!existingCodes.has(firstCopy)) return firstCopy;

  let index = 2;
  while (existingCodes.has(`${baseCode}-copy-${index}`)) index += 1;
  return `${baseCode}-copy-${index}`;
}

function duplicateTaskCodeMessage(code: string) {
  return `Task code "${code}" already exists in this project. Please use a different code.`;
}

function QuickProgressEditor({ task, onRefresh }: { task: WbsTaskRecord; onRefresh: () => void }) {
  const [value, setValue] = useState(String(task.progress));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(String(task.progress));
  }, [task.progress]);

  const isLocked = ["approved", "completed", "closed"].includes(task.status) || task.qa_status === "approved";

  async function commit() {
    const next = Math.max(0, Math.min(100, parseInt(value) || 0));
    if (next === task.progress) {
      setValue(String(task.progress));
      return;
    }
    setSaving(true);
    const updates: Record<string, unknown> = { progress: next, updated_at: new Date().toISOString() };
    if (next === 100 && task.status !== "closed" && task.status !== "cancelled") {
      updates.status = "submitted";
    } else if (next > 0 && task.status === "open") {
      updates.status = "in_progress";
    }
    const { error } = await updateWbsTaskById(updates, task.id);
    if (error) {
      toast.error(error.message);
      setValue(String(task.progress));
    } else {
      await insertWbsAuditLog({
        wbs_task_id: task.id,
        wbs_node_id: task.wbs_node_id,
        project_id: task.project_id,
        action: "Progress Updated",
        field_name: "progress",
        old_value: String(task.progress),
        new_value: String(next),
      });
      toast.success(`Progress updated to ${next}%`);
      onRefresh();
    }
    setSaving(false);
  }

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      title={isLocked ? "Approved tasks are locked" : "Type progress and press Enter to save"}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
      ) : (
        <>
          <input
            type="number"
            min="0"
            max="100"
            value={value}
            disabled={isLocked}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setValue(String(task.progress));
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-center text-[11px] font-medium tabular-nums outline-none focus:border-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-[10px] text-slate-400">%</span>
        </>
      )}
    </div>
  );
}

export function WbsExecutionView({ tasks, taskAssignerNames, onEdit, onDelete, onRefresh }: WbsExecutionViewProps) {
  const codeById = new Map(tasks.map((t) => [t.id, t.task_code]));
  const { unreadTaskIds } = useTaskAlerts();

  async function handleDuplicate(task: WbsTaskRecord) {
    const { data: projectTasks, error: codeError } = await listWbsTasksByProjectId(task.project_id, "task_code");

    if (codeError) {
      toast.error(codeError.message);
      return;
    }

    const existingCodes = new Set((projectTasks ?? []).map((item) => item.task_code as string));
    const copyCode = nextCopyCode(task.task_code, existingCodes);
    const { error } = await insertWbsTask({
      wbs_node_id: task.wbs_node_id,
      project_id: task.project_id,
      task_code: copyCode,
      task_name: task.task_name + " (copy)",
      description: task.description,
      status: "open",
      progress: 0,
      priority: task.priority,
      discipline: task.discipline,
      owner_name: null,
      start_date: null,
      end_date: null,
      delay_status: "on_track",
      docs_count: 0,
      photos_count: 0,
      qa_status: "not_required",
      budget_cost: task.budget_cost,
      actual_cost: null,
      planned_hours: task.planned_hours,
      actual_hours: null,
    });
    if (error) toast.error(error.message.includes("wbs_tasks_project_id_task_code_key") ? duplicateTaskCodeMessage(copyCode) : error.message);
    else {
      toast.success("Task duplicated");
      onRefresh();
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <p className="text-xs">No tasks for this node</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {[
          { label: "Ready", count: tasks.filter((t) => t.status === "open" || t.status === "in_progress").length },
          { label: "Paused", count: tasks.filter((t) => t.status === "paused").length },
          { label: "Blocked", count: tasks.filter((t) => t.status === "blocked").length },
          { label: "Need QA", count: tasks.filter((t) => t.qa_status === "pending" || t.qa_status === "submitted").length },
          { label: "At Risk", count: tasks.filter((t) => t.status !== "closed" && t.status !== "cancelled" && t.delay_status === "delayed").length },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="text-[10px] text-slate-500">{item.label}</div>
            <div className="mt-0.5 text-lg font-bold">{item.count}</div>
          </div>
        ))}
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1050px] text-left text-xs">
          <thead className="bg-slate-50">
            <tr className="border-b text-[10px] uppercase text-slate-500">
              <th className="py-2.5 pl-3 pr-2 font-medium">Task</th>
              <th className="py-2.5 px-2 font-medium">Status</th>
              <th className="py-2.5 px-2 font-medium">Receiver Task</th>
              <th className="py-2.5 px-2 font-medium">Assignee Task</th>
              <th className="py-2.5 px-2 font-medium">Progress</th>
              <th className="py-2.5 px-2 font-medium">Schedule</th>
              <th className="py-2.5 px-2 font-medium">Delay</th>
              <th className="py-2.5 px-2 font-medium">Dependency</th>
              <th className="py-2.5 px-2 font-medium">Evidence</th>
              <th className="py-2.5 px-2 font-medium">QA</th>
              <th className="py-2.5 px-2 font-medium">Priority</th>
              <th className="py-2.5 pr-3 pl-2 font-medium w-10">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                className={cn(
                  "border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors",
                  task.status === "cancelled" && "opacity-50",
                )}
                onClick={() => onEdit(task)}
              >
                <td className="py-3 pl-3 pr-2">
                  <div className="flex items-center gap-1.5">
                    <div className={cn("font-medium text-xs", task.status === "cancelled" && "line-through")}>{task.task_name}</div>
                    {unreadTaskIds.has(task.id) && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600">
                        <Bell className="h-2.5 w-2.5 text-white" />
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">{task.task_code} · {task.discipline ?? "—"} · {task.wbs_node_id.slice(0, 8)}</div>
                </td>
                <td className="px-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap", statusClass(task.status))}>
                    {task.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-2">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px]">{task.owner_name ?? "—"}</span>
                  </div>
                </td>
                <td className="px-2">
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="h-3 w-3 text-slate-400" />
                    <span className="text-[10px]">{taskAssignerNames[task.id] ?? "—"}</span>
                  </div>
                </td>
                <td className="px-2">
                  <QuickProgressEditor task={task} onRefresh={onRefresh} />
                </td>
                <td className="px-2 whitespace-nowrap">
                  <div className="text-[10px]">{task.start_date ?? "—"} → {task.end_date ?? "—"}</div>
                  {task.baseline_finish_date && task.end_date && (() => {
                    const v = differenceInDays(new Date(task.end_date), new Date(task.baseline_finish_date));
                    if (v === 0) return null;
                    return (
                      <div className={`text-[9px] font-medium mt-0.5 ${v > 0 ? "text-red-500" : "text-emerald-600"}`}>
                        {v > 0 ? `+${v}d` : `${v}d`} vs baseline
                      </div>
                    );
                  })()}
                </td>
                <td className="px-2">
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] whitespace-nowrap", delayClass(task.delay_status))}>
                    {task.delay_status === "on_track" ? "On Track" :
                     task.delay_status === "risk" ? "At Risk" :
                     task.delay_status === "delayed" ? "Delayed" :
                     task.delay_status === "blocked" ? "Blocked" : task.delay_status}
                  </span>
                </td>
                <td className="px-2">
                  {(task.dependency_task_ids?.length ?? 0) > 0 ? (() => {
                    const ids = task.dependency_task_ids ?? [];
                    const type = (task.dependency_types?.[0] ?? "fs").toLowerCase();
                    const lag = Number(task.dependency_lag_days?.[0] ?? 0);
                    const label = ids
                      .map((id, k) => {
                        const l = Number(task.dependency_lag_days?.[k] ?? 0);
                        return `${codeById.get(id) ?? "?"}${(task.dependency_types?.[k] ?? "fs").toUpperCase()}${l ? (l > 0 ? `+${l}d` : `${l}d`) : ""}`;
                      })
                      .join(", ");
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase shrink-0",
                          type === "fs" ? "bg-blue-50 text-blue-700 border-blue-200" :
                          type === "ss" ? "bg-purple-50 text-purple-700 border-purple-200" :
                          type === "ff" ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-slate-50 text-slate-600 border-slate-200"
                        )}>
                          {type.toUpperCase()}
                        </span>
                        <span className="text-[10px] truncate max-w-[100px]" title={label}>
                          {codeById.get(ids[0]) ?? "—"}
                        </span>
                        {ids.length > 1 ? (
                          <span className="text-[9px] text-slate-400 shrink-0">+{ids.length - 1}</span>
                        ) : lag !== 0 ? (
                          <span className="text-[9px] text-slate-400 shrink-0">{lag > 0 ? `+${lag}d` : `${lag}d`}</span>
                        ) : null}
                      </div>
                    );
                  })() : (
                    <span className="text-[10px] text-slate-400">—</span>
                  )}
                </td>
                <td className="px-2">
                  <div className="flex gap-2 text-[10px] text-slate-600">
                    <span className="flex items-center gap-0.5"><FileText className="h-3 w-3" />{task.docs_count}</span>
                    <span className="flex items-center gap-0.5"><Camera className="h-3 w-3" />{task.photos_count}</span>
                  </div>
                </td>
                <td className="px-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap", statusClass(task.qa_status))}>
                    {task.qa_status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap", priorityClass(task.priority))}>
                    {task.priority}
                  </span>
                </td>
                <td className="px-2 pr-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      aria-label={`Actions for ${task.task_name}`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[140px]">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(task); }}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(task); }}>
                        <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete task "${task.task_name}"?`)) onDelete(task);
                        }}
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && (
          <div className="border-t border-slate-100 px-3 py-8 text-center text-xs text-slate-400">
            No tasks match the selected filters
          </div>
        )}
      </div>
    </div>
  );
}
