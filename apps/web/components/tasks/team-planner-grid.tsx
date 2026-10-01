"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isSameDay, startOfWeek, addDays } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type WbsTaskRecord } from "@/components/wbs/wbs-types";
import { createClient } from "@/lib/supabase/client";
import {
  ensureWeekPlan,
  fetchWeekPlan,
  savePlanAssignments,
  setWeeklyPlanStatus,
  toWeekStartDate,
  type WeeklyPlanAssignment,
  type WeeklyPlanRecord,
} from "@/lib/tasks/team-planning-store";
import { cn } from "@/lib/utils";
import { isActiveTask } from "@/lib/task-scope";
import { updateWbsTaskById } from "@/lib/tasks/tasks-queries";

interface PlannerMember {
  id: string;
  full_name: string;
  job_title: string | null;
}

interface TeamPlannerGridProps {
  tasks: WbsTaskRecord[];
  members: PlannerMember[];
  canPlan: boolean;
  projectId: string | null;
  departmentId: string | null;
  viewerUserId: string | null;
  onTaskMoved: () => void;
  onOpenTask: (task: WbsTaskRecord) => void;
}

const DAILY_CAPACITY_HOURS = 8;
const WEEK_CAPACITY_HOURS = DAILY_CAPACITY_HOURS * 5;

export function TeamPlannerGrid({
  tasks,
  members,
  canPlan,
  projectId,
  departmentId,
  viewerUserId,
  onTaskMoved,
  onOpenTask,
}: TeamPlannerGridProps) {
  const supabase = useMemo(() => createClient(), []);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragAnchorDay, setDragAnchorDay] = useState<number | null>(null);

  const [plan, setPlan] = useState<WeeklyPlanRecord | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);

  const weekStartStr = toWeekStartDate(weekStart);
  const hasPlanContext = !!projectId && !!departmentId;
  const activePlan = hasPlanContext ? plan : null;
  const planLocked = !!activePlan && activePlan.status !== "draft";
  const editable = canPlan && !planLocked;
  const canPersist = editable && !!projectId && !!departmentId && !!viewerUserId;

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const activeTasks = useMemo(() => tasks.filter(isActiveTask), [tasks]);

  const scheduled = useMemo(() => activeTasks.filter((t) => t.start_date && t.end_date), [activeTasks]);

  const backlog = useMemo(
    () =>
      activeTasks.filter(
        (t) => !t.owner_id || !t.start_date || !t.end_date || !memberById.has(t.owner_id),
      ),
    [activeTasks, memberById],
  );

  function chipsFor(memberId: string, day: Date): { task: WbsTaskRecord; anchorDay: number }[] {
    const dayStr = format(day, "yyyy-MM-dd");
    return scheduled
      .filter((t) => t.owner_id === memberId && t.start_date! <= dayStr && t.end_date! >= dayStr)
      .map((task) => ({
        task,
        anchorDay: days.findIndex((d) => format(d, "yyyy-MM-dd") === task.start_date),
      }));
  }

  const weeklyHours = useMemo(() => {
    const hours = new Map<string, number>();
    for (const t of scheduled) {
      if (!t.owner_id || !memberById.has(t.owner_id)) continue;
      const s = new Date(t.start_date!);
      const e = new Date(t.end_date!);
      if (!days.some((d) => d >= s && d <= e)) continue;
      const estimated = t.planned_hours && t.planned_hours > 0
        ? Math.min(t.planned_hours, WEEK_CAPACITY_HOURS)
        : DAILY_CAPACITY_HOURS;
      hours.set(t.owner_id, (hours.get(t.owner_id) ?? 0) + estimated);
    }
    return hours;
  }, [scheduled, days, memberById]);

  useEffect(() => {
    if (!projectId || !departmentId) return;
    let cancelled = false;
    async function loadPlan() {
      setPlanLoading(true);
      try {
        const row = await fetchWeekPlan(supabase, { projectId: projectId!, departmentId: departmentId!, weekStart: weekStartStr });
        if (!cancelled) {
          setPlan(row);
          setPlanDirty(false);
        }
      } catch {
        if (!cancelled) setPlan(null);
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    }
    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, [supabase, projectId, departmentId, weekStartStr]);

  function snapshotAssignments(): WeeklyPlanAssignment[] {
    const weekEndStr = toWeekStartDate(addDays(weekStart, 6));
    return scheduled
      .filter(
        (t) =>
          t.owner_id &&
          memberById.has(t.owner_id) &&
          t.start_date! <= weekEndStr &&
          t.end_date! >= weekStartStr,
      )
      .map((t) => ({
        wbs_task_id: t.id,
        responsible_id: t.owner_id!,
        responsible_name: t.owner_name,
        target_progress: Math.max(0, Math.min(100, Math.round(t.progress))),
      }));
  }

  async function persistPlan(): Promise<WeeklyPlanRecord | null> {
    if (!projectId || !departmentId || !viewerUserId) return null;
    const planRow = await ensureWeekPlan(supabase, {
      projectId,
      departmentId,
      weekStart: weekStartStr,
      userId: viewerUserId,
      title: `Team plan · ${format(weekStart, "dd MMM yyyy")}`,
    });
    await savePlanAssignments(supabase, planRow.id, snapshotAssignments());
    setPlan(planRow);
    setPlanDirty(false);
    return planRow;
  }

  async function handleSavePlan() {
    setPlanSaving(true);
    try {
      await persistPlan();
      toast.success("Weekly plan saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the weekly plan");
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleSubmitPlan() {
    if (activePlan?.status === "submitted") return;
    setPlanSaving(true);
    try {
      const planRow = await persistPlan();
      if (!planRow) return;
      await setWeeklyPlanStatus(supabase, planRow.id, "submitted");
      setPlan({ ...planRow, status: "submitted" });
      toast.success("Weekly plan submitted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit the weekly plan");
    } finally {
      setPlanSaving(false);
    }
  }

  async function handleReopenPlan() {
    if (!activePlan) return;
    setPlanSaving(true);
    try {
      await setWeeklyPlanStatus(supabase, activePlan.id, "draft");
      setPlan({ ...activePlan, status: "draft" });
      toast.success("Weekly plan reopened for editing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reopen the weekly plan");
    } finally {
      setPlanSaving(false);
    }
  }

  async function applyDrop(targetMemberId: string, targetDayIndex: number) {
    if (!dragTaskId) return;
    const task = activeTasks.find((t) => t.id === dragTaskId);
    setDragTaskId(null);
    setDragAnchorDay(null);
    if (!task) return;

    const member = memberById.get(targetMemberId);
    if (!member) return;

    try {
      if (!task.owner_id || task.owner_id !== targetMemberId) {
        const { error } = await updateWbsTaskById({ owner_id: targetMemberId, owner_name: member.full_name }, task.id);
        if (error) throw error;
        toast.success(`Assigned to ${member.full_name}`);
      } else if (
        dragAnchorDay !== null &&
        dragAnchorDay !== targetDayIndex &&
        task.start_date &&
        task.end_date
      ) {
        const delta = targetDayIndex - dragAnchorDay;
        const shift = (dateStr: string) =>
          format(addDays(new Date(dateStr), delta), "yyyy-MM-dd");
        const { error } = await updateWbsTaskById({ start_date: shift(task.start_date), end_date: shift(task.end_date) }, task.id);
        if (error) throw error;
        toast.success(`Shifted ${Math.abs(delta)} day(s)`);
      } else {
        return;
      }
      setPlanDirty(true);
      onTaskMoved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 rounded-lg" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-44 text-center text-xs font-semibold">
            {format(weekStart, "dd MMM")} – {format(addDays(weekStart, 6), "dd MMM yyyy")}
          </span>
          <Button size="sm" variant="outline" className="h-7 rounded-lg" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {planLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : activePlan ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                activePlan.status === "draft" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700",
              )}
            >
              Plan {activePlan.status}
              {planDirty && activePlan.status === "draft" ? " · unsaved changes" : ""}
            </span>
          ) : (
            canPlan && <span className="text-[11px] text-muted-foreground">No saved plan for this week yet</span>
          )}
          {canPlan && !projectId && (
            <span className="text-[11px] text-muted-foreground">Select a project to save the plan</span>
          )}
          {editable && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg text-xs"
                disabled={!canPersist || planSaving}
                onClick={() => void handleSavePlan()}
              >
                {planSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save plan{planDirty ? " •" : ""}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-lg text-xs"
                disabled={!canPersist || planSaving}
                onClick={() => void handleSubmitPlan()}
              >
                <Send className="h-3.5 w-3.5" /> Submit
              </Button>
            </>
          )}
          {planLocked && canPlan && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-lg text-xs"
              disabled={planSaving}
              onClick={() => void handleReopenPlan()}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reopen as draft
            </Button>
          )}
          {!canPlan && (
            <span className="text-[11px] text-muted-foreground">Read-only — planning actions require Department Manager role</span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="sticky left-0 z-10 w-48 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold">Member</th>
                {days.map((day) => (
                  <th key={day.toISOString()} className={cn("px-2 py-2 text-center text-[11px] font-medium",
                    isSameDay(day, new Date()) ? "bg-indigo-50 text-indigo-700" : "text-slate-500")}>
                    <div>{format(day, "EEE")}</div>
                    <div className="text-[10px] font-normal">{format(day, "dd MMM")}</div>
                  </th>
                ))}
                <th className="w-28 border-l border-slate-200 px-2 py-2 text-center text-[11px] font-medium text-slate-500">Load</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-xs text-slate-400">
                    No members found in your department
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const load = weeklyHours.get(member.id) ?? 0;
                  const overCapacity = load > WEEK_CAPACITY_HOURS;
                  return (
                    <tr key={member.id} className="border-b border-slate-100 last:border-0">
                      <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2">
                        <div className="truncate text-xs font-medium">{member.full_name}</div>
                        {member.job_title && <div className="truncate text-[10px] text-slate-400">{member.job_title}</div>}
                      </td>
                      {days.map((day, dayIndex) => (
                        <td
                          key={day.toISOString()}
                          className={cn("border-r border-slate-100 p-1 align-top last:border-r-0",
                            isSameDay(day, new Date()) && "bg-indigo-50/40",
                            isSameDay(day, new Date()) === false && (dayIndex >= 5) && "bg-slate-50/60")}
                          onDragOver={(e) => { if (editable && dragTaskId) e.preventDefault(); }}
                          onDrop={() => { if (editable) void applyDrop(member.id, dayIndex); }}
                        >
                          <div className="flex min-h-14 flex-col gap-1">
                            {chipsFor(member.id, day).map(({ task }) => (
                              <button
                                key={`${task.id}-${day.toISOString()}`}
                                draggable={editable}
                                onDragStart={(e) => {
                                  setDragTaskId(task.id);
                                  setDragAnchorDay(task.start_date ? days.findIndex((d) => format(d, "yyyy-MM-dd") === task.start_date) : dayIndex);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onClick={() => onOpenTask(task)}
                                className={cn(
                                  "truncate rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight hover:shadow-sm",
                                  task.priority === "critical" || task.priority === "high"
                                    ? "border-amber-300 bg-amber-50 text-amber-900"
                                    : "border-slate-200 bg-white text-slate-700",
                                  !editable ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                                )}
                                title={`${task.task_code} · ${task.task_name}`}
                              >
                                <span className="block truncate font-medium">{task.task_name}</span>
                                <span className="text-[9px] opacity-70">{task.task_code} · {Math.round(task.progress)}%</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      ))}
                      <td className="border-l border-slate-200 p-2 align-middle">
                        <div className={cn("mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold tabular-nums",
                          overCapacity ? "text-red-600" : "text-slate-500")}>
                          {overCapacity && <AlertTriangle className="h-3 w-3" />}
                          ~{load}h
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full", overCapacity ? "bg-red-500" : "bg-emerald-500")}
                            style={{ width: `${Math.min((load / WEEK_CAPACITY_HOURS) * 100, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <aside className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
            <Inbox className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold">Backlog / Unassigned</span>
            <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{backlog.length}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-2">
            {backlog.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-slate-400">Everything is planned</div>
            ) : (
              backlog.map((task) => (
                <button
                  key={task.id}
                  draggable={editable}
                  onDragStart={(e) => {
                    setDragTaskId(task.id);
                    setDragAnchorDay(null);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onOpenTask(task)}
                  className={cn(
                    "w-full truncate rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-[11px]",
                    editable ? "cursor-grab hover:bg-white active:cursor-grabbing" : "",
                  )}
                  title={`${task.task_code} · ${task.task_name}`}
                >
                  <span className="block truncate font-medium text-slate-700">{task.task_name}</span>
                  <span className="text-[9px] text-slate-400">
                    {task.task_code}{task.owner_id ? ` · ${task.owner_name}` : ""}{!task.start_date ? " · no dates" : ""}
                  </span>
                </button>
              ))
            )}
          </div>
          {editable && (
            <div className="border-t border-slate-100 px-3 py-2 text-[10px] leading-relaxed text-slate-400">
              Drag a backlog item onto a member row to assign it.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
