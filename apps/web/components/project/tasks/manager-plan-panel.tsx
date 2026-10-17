"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type WbsTaskRecord } from "@/components/project/wbs/wbs-types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { TASKS_MODULE, type TaskViewer } from "@/lib/task-scope";
import { loadEmployeeCapacity } from "@/lib/project/tasks/capacity-service";
import type { CapacityResult } from "@/lib/project/tasks/capacity";
import { weekStartOf } from "@/lib/project/tasks/my-work";
import {
  fetchPlanAssignments,
  fetchWeekPlan,
  setWeeklyPlanStatus,
  type SavedPlanAssignment,
  type WeeklyPlanRecord,
} from "@/lib/project/tasks/team-planning-store";
import {
  loadPlanHistory,
  publishTeamPlan,
  reopenTeamPlan,
  setTaskPlanning,
  type CapacityOverrideInput,
  type PlanHistory,
} from "@/lib/project/tasks/team-plan-service";

interface Member {
  id: string;
  full_name: string;
  job_title: string | null;
}

interface Props {
  tasks: WbsTaskRecord[];
  members: Member[];
  projectId: string | null;
  departmentId: string | null;
  viewer: TaskViewer;
  /** Called after task or plan changes so the parent can reload its task list. */
  onChanged: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const selectCls = "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none disabled:bg-slate-50 disabled:text-slate-500";
const LEVEL: Record<string, { label: string; cls: string; bar: string }> = {
  ok: { label: "OK", cls: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
  warn: { label: "High", cls: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  over: { label: "Over capacity", cls: "bg-red-50 text-red-700", bar: "bg-red-500" },
  unknown: { label: "No data", cls: "bg-slate-100 text-slate-600", bar: "bg-slate-300" },
};

export function ManagerPlanPanel({ tasks, members, projectId, departmentId, viewer, onChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayIso()));
  const weekEnd = addDays(weekStart, 6);
  const [plan, setPlan] = useState<WeeklyPlanRecord | null>(null);
  const [revisionNo, setRevisionNo] = useState(0);
  const [items, setItems] = useState<SavedPlanAssignment[]>([]);
  const [capacity, setCapacity] = useState<Map<string, CapacityResult>>(new Map());
  const [history, setHistory] = useState<PlanHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});

  const perms = viewer.permissions.permissions;
  const canPlan = hasPermission(perms, TASKS_MODULE, "plan_team", "edit");
  const canApprove = hasPermission(perms, TASKS_MODULE, "approve_task", "approve");
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const load = useCallback(async () => {
    if (!projectId || !departmentId) return;
    setLoading(true);
    try {
      const p = await fetchWeekPlan(supabase, { projectId, departmentId, weekStart });
      setPlan(p);
      const [rows, cap, hist, rev] = await Promise.all([
        p ? fetchPlanAssignments(supabase, p.id) : Promise.resolve([]),
        loadEmployeeCapacity(supabase, { profileIds: members.map((m) => m.id), from: weekStart, to: weekEnd, projectId }),
        p ? loadPlanHistory(supabase, p.id) : Promise.resolve(null),
        p ? supabase.from("weekly_plans").select("revision_no").eq("id", p.id).maybeSingle() : Promise.resolve(null),
      ]);
      setItems(rows);
      setCapacity(cap);
      setHistory(hist);
      setRevisionNo(Number((rev as { data?: { revision_no?: number } } | null)?.data?.revision_no ?? 0));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the plan");
    } finally {
      setLoading(false);
    }
  }, [supabase, projectId, departmentId, weekStart, weekEnd, members]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!projectId || !departmentId) {
    return <div className="py-10 text-center text-sm text-slate-500">Select a project to plan and publish a team plan.</div>;
  }

  const status = plan?.status ?? null;
  const editable = canPlan && status === "draft";
  const rowsInPlan = items.map((i) => ({ item: i, task: taskById.get(i.wbs_task_id) }));
  const stale = rowsInPlan.filter((r) => r.task && r.task.owner_id !== r.item.responsible_id);
  const planMembers = [...new Set(items.map((i) => i.responsible_id))];
  const flagged = planMembers.filter((id) => ["warn", "over"].includes(capacity.get(id)?.level ?? "ok"));
  const needsReason = revisionNo > 0;
  const canPublish =
    canPlan && !!plan && items.length > 0 && stale.length === 0 && (status === "approved" || ((status === "draft" || status === "submitted") && canApprove));

  async function updateItem(taskId: string, changes: Parameters<typeof setTaskPlanning>[2], planItem?: SavedPlanAssignment) {
    await run(async () => {
      await setTaskPlanning(supabase, taskId, changes);
      if (changes.owner_id && planItem) {
        const { error } = await supabase
          .from("weekly_plan_tasks")
          .update({ responsible_id: changes.owner_id, responsible_name: memberById.get(changes.owner_id)?.full_name ?? null })
          .eq("id", planItem.id);
        if (error) throw new Error(error.message);
      }
    }, "Task updated");
  }

  function overridesToSend(): CapacityOverrideInput[] {
    return flagged.map((id) => {
      const c = capacity.get(id)!;
      return {
        profile_id: id,
        period_start: weekStart,
        period_end: weekEnd,
        planned_hours: c.plannedHours,
        available_hours: c.availableHours,
        utilization_pct: c.utilizationPct,
        reason: overrideReasons[id] ?? "",
      };
    });
  }

  const publishBlocked =
    (needsReason && reason.trim().length < 5) || flagged.some((id) => (overrideReasons[id] ?? "").trim().length < 5);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-44 text-center text-xs font-semibold">
            {weekStart} → {weekEnd}
          </span>
          <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setWeekStart(weekStartOf(todayIso()))}>
            This week
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          {plan ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              Plan {status}
              {revisionNo > 0 ? ` · revision ${revisionNo}` : ""}
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">No saved plan for this week. Save one in Team Planning first.</span>
          )}
          {plan && (status === "submitted" || status === "approved") && canPlan && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => run(() => setWeeklyPlanStatus(supabase, plan.id, "draft"), "Plan returned to draft")}>
              <RotateCcw className="h-3.5 w-3.5" /> Return to draft
            </Button>
          )}
          {plan && status === "draft" && canPlan && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy || items.length === 0} onClick={() => run(() => setWeeklyPlanStatus(supabase, plan.id, "submitted"), "Plan submitted for approval")}>
              <Send className="h-3.5 w-3.5" /> Submit for approval
            </Button>
          )}
          {plan && status === "submitted" && canApprove && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => run(() => setWeeklyPlanStatus(supabase, plan.id, "approved"), "Plan approved")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </Button>
          )}
          {plan && status !== "published" && (
            <Button size="sm" className="h-7 gap-1 bg-slate-900 text-xs" disabled={busy || !canPublish} onClick={() => setPublishOpen(true)}>
              {revisionNo > 0 ? "Publish revision" : "Publish plan"}
            </Button>
          )}
          {plan && status === "published" && canPlan && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => setReopenOpen(true)}>
              Reopen to revise
            </Button>
          )}
        </div>
      </div>

      {plan && status !== "published" && !canPublish && items.length > 0 && (
        <p className="text-xs text-amber-700">
          {stale.length > 0
            ? `${stale.length} task(s) have a different owner than the saved plan. Save the plan again in Team Planning.`
            : status === "draft" || status === "submitted"
              ? "The plan must be approved before it can be published."
              : ""}
        </p>
      )}

      {/* Team capacity */}
      <section className="rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">Team capacity this week</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-1.5">Member</th>
                <th className="px-3 py-1.5">Available</th>
                <th className="px-3 py-1.5">Planned</th>
                <th className="px-3 py-1.5 w-48">Utilization</th>
                <th className="px-3 py-1.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => {
                const c = capacity.get(m.id);
                const lv = LEVEL[c?.level ?? "unknown"];
                const pct = c?.utilizationPct ?? (c && c.plannedHours > 0 ? 100 : 0);
                return (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{m.full_name}</div>
                      <div className="text-[10px] text-slate-500">{m.job_title}</div>
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">{c ? `${c.availableHours}h` : "—"}</td>
                    <td className="px-3 py-1.5 tabular-nums">{c ? `${c.plannedHours}h` : "—"}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className={cn("h-2 rounded-full", lv.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", lv.cls)}>
                          {c?.utilizationPct != null ? `${Math.round(c.utilizationPct)}%` : lv.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-slate-500">{c?.limitations.join(" ")}</td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                    No team members in this department yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Plan items */}
      {plan && (
        <section className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">
            Plan tasks ({items.length}){!editable && status !== "published" ? " · return to draft to edit" : ""}
            {status === "published" ? " · published, reopen to edit" : ""}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-1.5">Task</th>
                  <th className="px-3 py-1.5">Responsible</th>
                  <th className="px-3 py-1.5">Reviewer</th>
                  <th className="px-3 py-1.5">Approver</th>
                  <th className="px-3 py-1.5 w-20">Est. h</th>
                  <th className="px-3 py-1.5">Start</th>
                  <th className="px-3 py-1.5">Finish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rowsInPlan.map(({ item, task }) => (
                  <tr key={item.id}>
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{task?.task_code ?? "Task"}</div>
                      <div className="max-w-56 truncate text-[10px] text-slate-500">{task?.task_name}</div>
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        className={selectCls}
                        disabled={!editable || busy || !task}
                        value={task?.owner_id ?? ""}
                        onChange={(e) => e.target.value && updateItem(item.wbs_task_id, { owner_id: e.target.value }, item)}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.full_name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <PersonSelect members={members} value={task?.reviewer_id ?? ""} disabled={!editable || busy || !task} exclude={task?.owner_id} onChange={(v) => updateItem(item.wbs_task_id, { reviewer_id: v })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <PersonSelect members={members} value={task?.approver_id ?? ""} disabled={!editable || busy || !task} exclude={task?.owner_id} onChange={(v) => updateItem(item.wbs_task_id, { approver_id: v })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        key={`${item.id}-${task?.estimated_hours ?? ""}`}
                        className="h-8 text-xs"
                        type="number"
                        min={0}
                        step="0.5"
                        disabled={!editable || busy || !task}
                        defaultValue={task?.estimated_hours ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (task?.estimated_hours ?? null)) void updateItem(item.wbs_task_id, { estimated_hours: v });
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        key={`${item.id}-s-${task?.start_date ?? ""}`}
                        className="h-8 text-xs"
                        type="date"
                        disabled={!editable || busy || !task}
                        defaultValue={task?.start_date ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (task?.start_date ?? null)) void updateItem(item.wbs_task_id, { start_date: v });
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        key={`${item.id}-f-${task?.end_date ?? ""}`}
                        className="h-8 text-xs"
                        type="date"
                        disabled={!editable || busy || !task}
                        defaultValue={task?.end_date ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (task?.end_date ?? null)) void updateItem(item.wbs_task_id, { end_date: v });
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={7}>
                      The saved plan has no tasks. Assign tasks in Team Planning and save the plan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* History */}
      {history && (history.revisions.length > 0 || history.overrides.length > 0) && (
        <section className="rounded-xl border border-slate-200 p-3 text-xs">
          <div className="mb-2 text-sm font-semibold">Plan history</div>
          {history.revisions.map((r) => (
            <div key={r.id} className="py-0.5">
              <span className="text-slate-400">{r.created_at.slice(0, 16).replace("T", " ")}</span>{" "}
              <span className="font-medium">
                {r.action === "published" ? `Published (revision ${r.revision_no})` : r.action === "reopened" ? "Reopened" : r.action}
              </span>
              {r.reason ? ` — ${r.reason}` : ""}
            </div>
          ))}
          {history.overrides.map((o) => (
            <div key={o.id} className="py-0.5 text-amber-700">
              Capacity override · {memberById.get(o.profile_id)?.full_name ?? "Member"} {o.utilization_pct != null ? `${Math.round(o.utilization_pct)}%` : ""} — {o.reason}
            </div>
          ))}
        </section>
      )}

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{revisionNo > 0 ? "Publish revised plan" : "Publish team plan"}</DialogTitle>
            <DialogDescription>
              Publishing assigns the tasks to their responsible people and notifies them. {items.length} task(s), {planMembers.length} person(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {flagged.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="font-medium text-amber-800">Capacity warnings — a reason is required for each person</div>
                {flagged.map((id) => {
                  const c = capacity.get(id)!;
                  return (
                    <div key={id} className="space-y-1">
                      <div className="text-xs">
                        {memberById.get(id)?.full_name}: {c.plannedHours}h planned of {c.availableHours}h available
                        {c.utilizationPct != null ? ` (${Math.round(c.utilizationPct)}%)` : ""}
                      </div>
                      <Input
                        placeholder="Reason for proceeding"
                        value={overrideReasons[id] ?? ""}
                        onChange={(e) => setOverrideReasons({ ...overrideReasons, [id]: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {needsReason && (
              <div>
                <div className="mb-1 text-xs font-medium">Reason for the revision (required)</div>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What changed and why" />
              </div>
            )}
            {flagged.length === 0 && !needsReason && <p className="text-xs text-slate-600">No capacity warnings for this plan.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || publishBlocked}
              onClick={async () => {
                if (!plan) return;
                await run(async () => {
                  const res = await publishTeamPlan(supabase, plan.id, { reason: reason || undefined, overrides: overridesToSend() });
                  toast.message(`Revision ${res.revision_no}: ${res.tasks_assigned} assigned, ${res.notifications} notified`);
                  setPublishOpen(false);
                  setReason("");
                  setOverrideReasons({});
                }, "Plan published");
              }}
            >
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog */}
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reopen the published plan</DialogTitle>
            <DialogDescription>The plan goes back to draft. Staff keep their current assignments until you publish the revision.</DialogDescription>
          </DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || reason.trim().length < 5 || !plan}
              onClick={async () => {
                if (!plan) return;
                await run(async () => {
                  await reopenTeamPlan(supabase, plan.id, reason);
                  setReopenOpen(false);
                }, "Plan reopened for revision");
              }}
            >
              Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PersonSelect({
  members,
  value,
  disabled,
  exclude,
  onChange,
}: {
  members: Member[];
  value: string;
  disabled: boolean;
  exclude?: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <select className={selectCls} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">None</option>
      {members
        .filter((m) => m.id !== exclude)
        .map((m) => (
          <option key={m.id} value={m.id}>{m.full_name}</option>
        ))}
    </select>
  );
}
