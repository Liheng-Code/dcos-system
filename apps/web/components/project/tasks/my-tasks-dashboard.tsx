"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  ListChecks,
  Loader2,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/ui/kpi-card";
import { type WbsTaskRecord } from "@/components/project/wbs/wbs-types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { createTaskAlert } from "@/lib/task-alerts";
import {
  canAcceptCrossRequests,
  isActiveTask,
  isMyTask,
  resolveViewer,
  type TaskViewer,
} from "@/lib/task-scope";
import { getDepartmentById, listWbsAuditLog, listWbsTasks, updateWbsTaskById } from "@/lib/project/tasks/tasks-queries";

interface ProjectRef {
  id: string;
  project_code: string;
  project_name: string;
}

type TaskRow = WbsTaskRecord & { projects?: ProjectRef | ProjectRef[] | null };

function projectLabel(task: TaskRow): string {
  const p = Array.isArray(task.projects) ? task.projects[0] : task.projects;
  return p ? `${p.project_code} · ${p.project_name}` : "Project";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MyTasksDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [viewer, setViewer] = useState<TaskViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [activity, setActivity] = useState<
    { id: string; action: string; new_value: string | null; created_at: string; wbs_task_id: string | null }[]
  >([]);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    resolveViewer(supabase).then((v) => {
      if (!v) router.push("/");
      else setViewer(v);
    });
  }, [supabase, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [tasksRes, logRes] = await Promise.all([
      listWbsTasks(),
      listWbsAuditLog(),
    ]);
    setTasks((tasksRes.data ?? []) as TaskRow[]);
    setActivity(
      (logRes.data ?? []) as {
        id: string;
        action: string;
        new_value: string | null;
        created_at: string;
        wbs_task_id: string | null;
      }[],
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const today = useMemo(() => new Date(), []);

  const myTasks = useMemo(
    () => (viewer ? tasks.filter((t) => isMyTask(t, viewer.userId)) : []),
    [tasks, viewer],
  );

  const activeTasks = useMemo(() => myTasks.filter(isActiveTask), [myTasks]);
  const overdue = useMemo(
    () => activeTasks.filter((t) => t.end_date && t.end_date < today.toISOString().slice(0, 10)),
    [activeTasks, today],
  );
  const dueThisWeek = useMemo(() => {
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const start = today.toISOString().slice(0, 10);
    const end = in7.toISOString().slice(0, 10);
    return activeTasks.filter((t) => t.end_date && t.end_date >= start && t.end_date <= end);
  }, [activeTasks, today]);
  const completedThisMonth = useMemo(() => {
    const monthPrefix = today.toISOString().slice(0, 7);
    return myTasks.filter(
      (t) =>
        ["completed", "closed", "approved"].includes(t.status) &&
        (t.end_date ?? "").startsWith(monthPrefix),
    );
  }, [myTasks, today]);

  const awaitingMyApproval = useMemo(
    () =>
      viewer
        ? myTasks.filter(
            (t) =>
              (t.status === "submitted" || t.status === "review") &&
              t.assignee_id === viewer.userId,
          )
        : [],
    [myTasks, viewer],
  );

  const incomingRequests = useMemo(
    () =>
      viewer
        ? tasks.filter(
            (t) =>
              t.requesting_department_id &&
              t.cross_dept_status === "requested" &&
              typeof t.department_id === "string" &&
              viewer.managedDepartmentIds.includes(t.department_id),
          )
        : [],
    [tasks, viewer],
  );

  const outgoingRequests = useMemo(
    () =>
      viewer
        ? tasks.filter(
            (t) =>
              typeof t.requesting_department_id === "string" &&
              viewer.managedDepartmentIds.includes(t.requesting_department_id) &&
              t.cross_dept_status !== "accepted",
          )
        : [],
    [tasks, viewer],
  );

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of activeTasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeTasks]);

  const myActivity = useMemo(() => {
    const myIds = new Set(myTasks.map((t) => t.id));
    return activity.filter((a) => a.wbs_task_id && myIds.has(a.wbs_task_id)).slice(0, 8);
  }, [activity, myTasks]);

  const decideCrossRequest = useCallback(
    async (task: TaskRow, decision: "accepted" | "rejected") => {
      if (!viewer) return;
      setDeciding(true);
      const note: string | null = decision === "rejected" ? rejectNote.trim() || null : null;
      const { error } = await updateWbsTaskById({
          cross_dept_status: decision,
          cross_dept_note: note,
          cross_dept_decided_by: viewer.userId,
          cross_dept_decided_at: new Date().toISOString(),
        }, task.id);
      setDeciding(false);
      if (error) {
        toast.error(error.message);
        return;
      }

      // Notify the requesting department head.
      const headRes = await getDepartmentById(task.requesting_department_id as string);
      await createTaskAlert(supabase, {
        projectId: task.project_id,
        taskId: task.id,
        actorId: viewer.userId,
        actorName: viewer.fullName,
        recipientId: (headRes.data?.department_head as string | undefined) ?? null,
        alertType:
          decision === "accepted" ? "cross_dept_accepted" : "cross_dept_rejected",
        title: decision === "accepted" ? "Cross-department request accepted" : "Cross-department request rejected",
        body: `${task.task_code} · ${task.task_name}`,
        taskCode: task.task_code,
        taskName: task.task_name,
        metadata: { decision, note },
      });

      toast.success(decision === "accepted" ? "Request accepted" : "Request rejected");
      setRejectTarget(null);
      setRejectNote("");
      refresh();
    },
    [viewer, rejectNote, supabase, refresh],
  );

  if (!viewer || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-xs font-medium text-slate-500">DCOS / My Tasks</div>
          <h1 className="text-xl font-bold tracking-tight">My Tasks</h1>
          <div className="mt-0.5 text-xs text-slate-500">
            Personal workload across all projects{viewer.departmentName ? ` · ${viewer.departmentName}` : ""}
          </div>
        </div>
        <Button size="sm" variant="outline" className="rounded-lg text-xs gap-1" onClick={() => void refresh()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Active Tasks" value={activeTasks.length} icon={ListChecks} href="/dashboard/tasks" />
        <KPICard
          label="Overdue"
          value={overdue.length}
          icon={AlertTriangle}
          gradient={overdue.length > 0 ? "from-red-500 to-orange-600" : undefined}
          subtitle="Past end date"
          href="/dashboard/tasks"
        />
        <KPICard
          label="Due This Week"
          value={dueThisWeek.length}
          icon={CalendarClock}
          subtitle="Next 7 days"
          href="/dashboard/tasks"
        />
        <KPICard
          label="Completed This Month"
          value={completedThisMonth.length}
          icon={CheckCircle2}
          subtitle="Finished tasks"
          href="/dashboard/tasks"
        />
      </section>

      {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="mb-3 flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold">Cross-Department Requests</h2>
            {incomingRequests.length > 0 && (
              <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                {incomingRequests.length} incoming
              </span>
            )}
          </div>

          {canAcceptCrossRequests(viewer) && incomingRequests.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Awaiting your decision</div>
              {incomingRequests.map((task) => (
                <div key={task.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button className="text-left" onClick={() => router.push(`/dashboard/tasks/${task.id}`)}>
                      <span className="text-xs font-mono text-slate-400">{task.task_code}</span>{" "}
                      <span className="text-sm font-medium hover:underline">{task.task_name}</span>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        From requesting dept · {projectLabel(task)} · due {task.end_date ?? "—"}
                      </div>
                    </button>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 rounded-lg bg-emerald-600 text-xs text-white"
                        disabled={deciding}
                        onClick={() => void decideCrossRequest(task, "accepted")}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg border-red-300 text-xs text-red-600"
                        disabled={deciding}
                        onClick={() => setRejectTarget(rejectTarget === task.id ? null : task.id)}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                  {rejectTarget === task.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Rejection reason…"
                        className="h-8 flex-1 rounded-lg border border-slate-200 px-2 text-xs outline-none"
                      />
                      <Button
                        size="sm"
                        className="h-8 rounded-lg bg-red-600 text-xs text-white"
                        disabled={deciding}
                        onClick={() => void decideCrossRequest(task, "rejected")}
                      >
                        Confirm Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {outgoingRequests.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Requested by your department</div>
              {outgoingRequests.map((task) => (
                <button key={task.id} className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50" onClick={() => router.push(`/dashboard/tasks/${task.id}`)}>
                  <span>
                    <span className="text-xs font-mono text-slate-400">{task.task_code}</span>{" "}
                    <span className="text-sm">{task.task_name}</span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      task.cross_dept_status === "requested" && "bg-amber-100 text-amber-700",
                      task.cross_dept_status === "rejected" && "bg-red-100 text-red-700",
                    )}
                  >
                    {statusLabel(task.cross_dept_status ?? "requested")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserCheck className="h-4 w-4 text-slate-500" /> Awaiting My Approval
            </h2>
            <span className="text-xs text-slate-500">{awaitingMyApproval.length}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {awaitingMyApproval.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">Nothing waiting on you</div>
            ) : (
              awaitingMyApproval.slice(0, 6).map((task) => (
                <button
                  key={task.id}
                  onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-mono text-slate-400">{task.task_code}</span>{" "}
                    <span className="truncate text-sm font-medium">{task.task_name}</span>
                    <div className="text-[11px] text-muted-foreground">{projectLabel(task)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold">Active by Status</h2>
          </div>
          <div className="space-y-2.5 px-4 py-3">
            {statusBreakdown.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No active tasks</div>
            ) : (
              statusBreakdown.map(([status, count]) => (
                <div key={status}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{statusLabel(status)}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full", status === "blocked" ? "bg-red-500" : status === "in_progress" ? "bg-blue-500" : "bg-slate-400")}
                      style={{ width: `${Math.max((count / activeTasks.length) * 100, 6)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Overdue & Due Soon
            </h2>
            <span className="text-xs text-slate-500">{overdue.length + dueThisWeek.length}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {overdue.length === 0 && dueThisWeek.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">All on track</div>
            ) : (
              [...overdue, ...dueThisWeek].slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  onClick={() => router.push(`/dashboard/tasks/${task.id}`)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <span className="truncate text-sm font-medium">{task.task_name}</span>
                    <div className="text-[11px] text-muted-foreground">{projectLabel(task)} · {Math.round(task.progress)}%</div>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    overdue.includes(task) ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                    {overdue.includes(task) ? "Overdue" : `Due ${task.end_date}`}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-slate-500" /> Recent Activity
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {myActivity.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">No recent activity</div>
            ) : (
              myActivity.map((entry) => (
                <div key={entry.id} className="px-4 py-2.5">
                  <div className="text-xs font-medium">{entry.action}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {entry.new_value ? `${entry.new_value} · ` : ""}
                    {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
