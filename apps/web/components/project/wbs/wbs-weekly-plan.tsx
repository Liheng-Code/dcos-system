"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { closeWeeklyPlan, deleteWeeklyPlanById, insertWeeklyPlanReturning, insertWeeklyPlanTasks, listWbsTasksByProjectIdOrderedByTaskCode, listWeeklyPlanTasksByWeeklyPlanId, listWeeklyPlansByProjectId, updateWeeklyPlanById } from "@/lib/project/wbs/wbs-queries";
import { ClipboardList, Plus, Loader2, ChevronDown, ChevronRight, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";

interface WeeklyPlan {
  id: string;
  project_id: string;
  week_start_date: string;
  title: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  /** Completion Plan 1.8 — set by close_weekly_plan(). */
  closed_at: string | null;
  pcr: number | null;
}

interface WeeklyPlanTask {
  id: string;
  weekly_plan_id: string;
  wbs_task_id: string;
  target_progress: number;
  responsible_name: string | null;
  notes: string | null;
  task_code?: string;
  task_name?: string;
  current_progress?: number;
  /** Frozen at close time (Completion Plan 1.8) — preferred over current_progress once the plan is closed. */
  actual_progress?: number | null;
  met?: boolean | null;
}

interface AvailableTask {
  id: string;
  task_code: string;
  task_name: string;
  owner_name: string | null;
  progress: number;
  status: string;
}

function mondayOfWeek(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft:     "bg-slate-100 text-slate-600",
    submitted: "bg-blue-50 text-blue-700",
    approved:  "bg-emerald-50 text-emerald-700",
  };
  return cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", map[status] ?? "bg-slate-100 text-slate-600");
}

export function WbsWeeklyPlan() {
  const { selectedProjectId: projectId } = useProject();
  const [plans, setPlans] = useState<WeeklyPlan[]>([]);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [planTasks, setPlanTasks] = useState<Record<string, WeeklyPlanTask[]>>({});
  const [availableTasks, setAvailableTasks] = useState<AvailableTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newPlan, setNewPlan] = useState({
    week_start_date: mondayOfWeek(1),
    title: "",
    notes: "",
  });
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [targetProgress, setTargetProgress] = useState<Record<string, number>>({});
  const [responsibleName, setResponsibleName] = useState<Record<string, string>>({});

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const { data } = await listWeeklyPlansByProjectId(projectId);
    if (data) setPlans(data as WeeklyPlan[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadPlans() flips its own loading flag
    void loadPlans();
    // Load available tasks for this project
    listWbsTasksByProjectIdOrderedByTaskCode(projectId)
      .then(({ data }) => {
        if (data) setAvailableTasks(data as AvailableTask[]);
      });
  }, [projectId, loadPlans]);

  async function loadPlanTasks(planId: string) {
    if (planTasks[planId]) return;
    const { data } = await listWeeklyPlanTasksByWeeklyPlanId(planId);
    if (data) {
      type RawRow = Omit<WeeklyPlanTask, "task_code" | "task_name" | "current_progress"> & {
        wbs_tasks: { task_code: string; task_name: string; progress: number } | null;
      };
      const rows = (data as unknown as RawRow[]).map((r) => ({
        ...r,
        task_code: r.wbs_tasks?.task_code,
        task_name: r.wbs_tasks?.task_name,
        current_progress: r.wbs_tasks?.progress,
      }));
      setPlanTasks((prev) => ({ ...prev, [planId]: rows }));
    }
  }

  function toggleExpand(planId: string) {
    if (expandedPlanId === planId) {
      setExpandedPlanId(null);
    } else {
      setExpandedPlanId(planId);
      void loadPlanTasks(planId);
    }
  }

  async function handleCreatePlan() {
    if (!newPlan.week_start_date) {
      toast.error("Week start date is required");
      return;
    }
    if (selectedTaskIds.size === 0) {
      toast.error("Select at least one task for the week");
      return;
    }
    setCreating(true);
    try {
      const { data: plan, error: planErr } = await insertWeeklyPlanReturning({
          project_id: projectId,
          week_start_date: newPlan.week_start_date,
          title: newPlan.title.trim() || null,
          notes: newPlan.notes.trim() || null,
          status: "draft",
        });

      if (planErr) throw planErr;

      const taskRows = Array.from(selectedTaskIds).map((taskId) => ({
        weekly_plan_id: plan.id,
        wbs_task_id: taskId,
        target_progress: targetProgress[taskId] ?? 100,
        responsible_name: responsibleName[taskId]?.trim() || null,
      }));

      const { error: tasksErr } = await insertWeeklyPlanTasks(taskRows);
      if (tasksErr) throw tasksErr;

      toast.success("Weekly plan created");
      setShowCreateForm(false);
      setSelectedTaskIds(new Set());
      setTargetProgress({});
      setResponsibleName({});
      setNewPlan({ week_start_date: mondayOfWeek(1), title: "", notes: "" });
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create plan");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeletePlan(planId: string) {
    setSaving(true);
    const { error } = await deleteWeeklyPlanById(planId);
    if (error) toast.error(error.message);
    else {
      toast.success("Plan deleted");
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      if (expandedPlanId === planId) setExpandedPlanId(null);
    }
    setSaving(false);
  }

  async function handleSubmitPlan(planId: string) {
    const { error } = await updateWeeklyPlanById({ status: "submitted" }, planId);
    if (error) toast.error(error.message);
    else {
      toast.success("Plan submitted");
      setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, status: "submitted" } : p));
    }
  }

  /** Completion Plan 1.8 — freezes actual progress against target and computes PCR at close time. */
  async function handleCloseWeek(planId: string) {
    setSaving(true);
    const { data: pcr, error } = await closeWeeklyPlan({ p_plan_id: planId });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Week closed — PCR ${pcr}%`);
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, status: "approved", pcr: pcr as number, closed_at: new Date().toISOString() } : p)),
      );
      setPlanTasks((prev) => {
        const rows = prev[planId];
        if (!rows) return prev;
        return {
          ...prev,
          [planId]: rows.map((r) => ({
            ...r,
            actual_progress: Math.round(r.current_progress ?? 0),
            met: Math.round(r.current_progress ?? 0) >= r.target_progress,
          })),
        };
      });
    }
    setSaving(false);
  }

  const pcrTrend = useMemo(
    () =>
      plans
        .filter((p) => p.pcr !== null)
        .slice() // plans is already sorted week_start_date desc
        .reverse()
        .slice(-8),
    [plans],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ClipboardList className="h-4 w-4" />
          Weekly Work Plans
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={() => setShowCreateForm((o) => !o)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Plan
        </Button>
      </div>

      {pcrTrend.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">PCR Trend</span>
          <div className="flex flex-1 items-end gap-1.5">
            {pcrTrend.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1" title={`${new Date(p.week_start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${p.pcr}%`}>
                <div
                  className={cn(
                    "w-4 rounded-sm",
                    (p.pcr ?? 0) >= 80 ? "bg-emerald-400" : (p.pcr ?? 0) >= 60 ? "bg-amber-400" : "bg-red-400",
                  )}
                  style={{ height: `${Math.max(4, ((p.pcr ?? 0) / 100) * 32)}px` }}
                />
              </div>
            ))}
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-600">
            {pcrTrend[pcrTrend.length - 1]?.pcr}% latest
          </span>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
          <h3 className="text-xs font-semibold text-blue-800">New Weekly Work Plan</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Week Starting (Monday) *</Label>
              <input
                type="date"
                value={newPlan.week_start_date}
                onChange={(e) => setNewPlan((p) => ({ ...p, week_start_date: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Plan Title</Label>
              <input
                type="text"
                value={newPlan.title}
                onChange={(e) => setNewPlan((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Week 23 — Tower B L08"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Notes</Label>
            <textarea
              value={newPlan.notes}
              onChange={(e) => setNewPlan((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-hidden focus:border-primary"
            />
          </div>

          {/* Task selection */}
          <div className="space-y-2">
            <Label className="text-[11px]">Select Tasks for this Week ({selectedTaskIds.size} selected)</Label>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background">
              {availableTasks.length === 0 && (
                <p className="px-3 py-4 text-center text-[10px] text-slate-400">No active tasks found</p>
              )}
              {availableTasks.map((t) => {
                const selected = selectedTaskIds.has(t.id);
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors",
                      selected && "bg-blue-50",
                    )}
                    onClick={() => {
                      setSelectedTaskIds((prev) => {
                        const s = new Set(prev);
                        if (s.has(t.id)) s.delete(t.id);
                        else s.add(t.id);
                        return s;
                      });
                    }}
                  >
                    <div className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      selected ? "border-primary bg-primary" : "border-slate-300",
                    )}>
                      {selected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[10px] font-medium text-slate-700">{t.task_code}</span>
                      <span className="ml-1.5 text-[10px] text-slate-600 truncate">{t.task_name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{t.progress}%</span>
                    {selected && (
                      <div
                        className="flex items-center gap-1 ml-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="text-[9px] text-slate-500">Target%</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={targetProgress[t.id] ?? 100}
                          onChange={(e) => setTargetProgress((prev) => ({ ...prev, [t.id]: Number(e.target.value) }))}
                          className="w-12 rounded border border-border bg-white px-1 py-0.5 text-[10px] text-center outline-hidden focus:border-primary"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={creating || selectedTaskIds.size === 0}
              onClick={handleCreatePlan}
            >
              {creating && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Create Plan
            </Button>
          </div>
        </div>
      )}

      {/* Plan list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
          <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-xs text-slate-400">No weekly plans yet. Create one to track planned work.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => {
            const isExpanded = expandedPlanId === plan.id;
            const weekEnd = new Date(plan.week_start_date);
            weekEnd.setDate(weekEnd.getDate() + 6);

            return (
              <div key={plan.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3"
                  onClick={() => toggleExpand(plan.id)}
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  }
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        {plan.title ?? `Week of ${new Date(plan.week_start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                      </span>
                      <span className={statusBadge(plan.status)}>{plan.status}</span>
                      {plan.pcr !== null && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            plan.pcr >= 80 ? "bg-emerald-50 text-emerald-700" : plan.pcr >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700",
                          )}
                          title="Plan Completion Rate — % of planned tasks that met their target progress"
                        >
                          PCR {plan.pcr}%
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {new Date(plan.week_start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" "}&ndash;{" "}
                      {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {plan.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 rounded-lg px-2 text-[10px]"
                        disabled={saving}
                        onClick={(e) => { e.stopPropagation(); void handleSubmitPlan(plan.id); }}
                      >
                        Submit
                      </Button>
                    )}
                    {plan.status === "submitted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 rounded-lg border-emerald-200 px-2 text-[10px] text-emerald-700 hover:bg-emerald-50"
                        disabled={saving}
                        title="Freeze actual progress against target and compute this week's Plan Completion Rate"
                        onClick={(e) => { e.stopPropagation(); void handleCloseWeek(plan.id); }}
                      >
                        Close Week
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 rounded-lg p-0 text-slate-400 hover:text-red-500"
                      disabled={saving}
                      onClick={(e) => { e.stopPropagation(); void handleDeletePlan(plan.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 pb-3">
                    {plan.notes && (
                      <p className="mb-3 mt-2 text-[10px] text-slate-500 italic">{plan.notes}</p>
                    )}
                    {!planTasks[plan.id] ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                      </div>
                    ) : planTasks[plan.id].length === 0 ? (
                      <p className="py-3 text-center text-[10px] text-slate-400">No tasks in this plan</p>
                    ) : (
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="border-b text-[9px] uppercase text-slate-400">
                            <th className="py-1.5 text-left">Task</th>
                            <th className="py-1.5 text-center">Target %</th>
                            <th className="py-1.5 text-center">{plan.status === "approved" ? "Actual % (frozen)" : "Current %"}</th>
                            <th className="py-1.5 text-center">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {planTasks[plan.id].map((pt) => {
                            const displayed = pt.actual_progress ?? pt.current_progress ?? 0;
                            const variance = displayed - pt.target_progress;
                            return (
                              <tr key={pt.id} className="border-b border-slate-50 last:border-0">
                                <td className="py-1.5 pr-2">
                                  <span className="font-mono font-medium text-slate-700">{pt.task_code}</span>
                                  <span className="ml-1 text-slate-500 truncate max-w-[140px] inline-block align-bottom">{pt.task_name}</span>
                                </td>
                                <td className="py-1.5 text-center font-medium">{pt.target_progress}%</td>
                                <td className="py-1.5 text-center">{displayed}%</td>
                                <td className={cn("py-1.5 text-center font-semibold",
                                  variance >= 0 ? "text-emerald-600" : "text-red-600"
                                )}>
                                  {variance >= 0 ? "+" : ""}{variance}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
