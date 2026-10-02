"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Columns3, Loader2, Plus, User, AlertTriangle, Clock, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { WbsExecutionView } from "@/components/project/wbs/wbs-execution-view";
import { WbsKanbanView } from "@/components/project/wbs/wbs-kanban-view";
import { WbsTaskKpiPage } from "@/components/project/wbs/wbs-task-kpi-page";
import { WbsTaskEditSheet } from "@/components/project/wbs/wbs-task-edit-sheet";
import { type WbsAuditLogRecord, type WbsNodeRecord, type WbsTaskRecord } from "@/components/project/wbs/wbs-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { deleteWbsTaskByIdReturning, listProfilesOfIdAndFullName, listWbsAuditLogByProjectIdWithFieldNameOwnerName, listWbsNodesByProjectIdOrderedByFullPath, listWbsTasksByProjectIdOrderedBySortOrder } from "@/lib/project/wbs/wbs-queries";

const TASK_TABS = [
  { key: "my_tasks", label: "My Tasks", icon: User },
  { key: "overdue", label: "Overdue", icon: AlertTriangle },
  { key: "pending_approval", label: "Pending Approval", icon: Clock },
  { key: "execution", label: "All Tasks", icon: ClipboardCheck },
  { key: "kanban", label: "Kanban", icon: Columns3 },
  { key: "kpi", label: "KPI", icon: BarChart2 },
] as const;

export function WbsTasksPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, selectedProject, loading: projectsLoading } = useProject();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<WbsTaskRecord[]>([]);
  const [nodes, setNodes] = useState<WbsNodeRecord[]>([]);
  const [taskAssignerNames, setTaskAssignerNames] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<string>("execution");
  const [statusFilter, setStatusFilter] = useState("");
  const [receiverFilter, setReceiverFilter] = useState("");
  const [assignerFilter, setAssignerFilter] = useState("");
  const [progressFilter, setProgressFilter] = useState("");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase]);

  const refresh = useCallback(async () => {
    await Promise.resolve();

    if (!selectedProjectId) {
      setTasks([]);
      setNodes([]);
      setTaskAssignerNames({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const [tasksRes, nodesRes, logsRes, profilesRes] = await Promise.all([
      listWbsTasksByProjectIdOrderedBySortOrder(selectedProjectId),
      listWbsNodesByProjectIdOrderedByFullPath(selectedProjectId),
      listWbsAuditLogByProjectIdWithFieldNameOwnerName(selectedProjectId),
      listProfilesOfIdAndFullName(),
    ]);
    const taskRecords = (tasksRes.data ?? []) as WbsTaskRecord[];
    const nodeRecords = (nodesRes.data ?? []) as WbsNodeRecord[];
    const assignmentLogs = (logsRes.data ?? []) as WbsAuditLogRecord[];
    const profileNames = new Map((profilesRes.data ?? []).map((profile) => [profile.id as string, profile.full_name as string]));
    const assignerNames: Record<string, string> = {};
    for (const log of assignmentLogs) {
      if (!log.wbs_task_id || assignerNames[log.wbs_task_id]) continue;
      assignerNames[log.wbs_task_id] = log.user_id ? profileNames.get(log.user_id) ?? "Unknown" : "Unknown";
    }
    setTasks(taskRecords);
    setNodes(nodeRecords);
    setTaskAssignerNames(assignerNames);
    setLoading(false);
  }, [selectedProjectId, supabase]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const statusOptions = useMemo(() => [...new Set(tasks.map((task) => task.status))].sort(), [tasks]);
  const receiverOptions = useMemo(() => [...new Set(tasks.map((task) => task.owner_name).filter(Boolean) as string[])].sort(), [tasks]);
  const assignerOptions = useMemo(() => [...new Set(tasks.map((task) => taskAssignerNames[task.id]).filter(Boolean) as string[])].sort(), [tasks, taskAssignerNames]);
  const filteredExecutionTasks = useMemo(() => tasks.filter((task) => {
    const assignerName = taskAssignerNames[task.id] ?? "";
    if (statusFilter && task.status !== statusFilter) return false;
    if (receiverFilter && task.owner_name !== receiverFilter) return false;
    if (assignerFilter && assignerName !== assignerFilter) return false;
    if (progressFilter === "not_started" && task.progress !== 0) return false;
    if (progressFilter === "in_progress" && (task.progress <= 0 || task.progress >= 100)) return false;
    if (progressFilter === "completed" && task.progress !== 100) return false;
    return true;
  }), [assignerFilter, progressFilter, receiverFilter, statusFilter, taskAssignerNames, tasks]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const myTasks = useMemo(() => tasks.filter((t) =>
    userId && (t.owner_id === userId || t.assignee_id === userId)
  ), [tasks, userId]);

  const overdueTasks = useMemo(() => tasks.filter((t) =>
    t.end_date && t.end_date < today && !["closed", "cancelled", "completed", "approved"].includes(t.status)
  ), [tasks, today]);

  const pendingApprovalTasks = useMemo(() => tasks.filter((t) =>
    t.status === "submitted" || t.status === "review"
  ), [tasks]);

  const activeTabCount = useMemo(() => ({
    my_tasks: myTasks.length,
    overdue: overdueTasks.length,
    pending_approval: pendingApprovalTasks.length,
    execution: filteredExecutionTasks.length,
    kanban: tasks.length,
    kpi: 0,
  }), [myTasks, overdueTasks, pendingApprovalTasks, filteredExecutionTasks, tasks]);

  if (loading || projectsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <p className="text-sm">Select a project from the header to view tasks</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-xs font-medium text-slate-500">DCOS / Tasks</div>
          <h1 className="text-xl font-bold tracking-tight">Tasks</h1>
          <div className="mt-0.5 text-xs text-slate-500">
            {selectedProject ? `${selectedProject.project_code} · ${selectedProject.project_name}` : "Selected project"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="rounded-lg bg-slate-900 text-xs"
            disabled={nodes.length === 0}
            onClick={() => { setShowCreateTask(true); }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Task
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <div className="flex flex-wrap gap-1">
            {TASK_TABS.map((tab) => {
              const count = activeTabCount[tab.key as keyof typeof activeTabCount];
              const isAlert = (tab.key === "overdue" || tab.key === "pending_approval") && count > 0;
              return (
                <Button
                  key={tab.key}
                  onClick={() => setMode(tab.key)}
                  variant={mode === tab.key ? "default" : "outline"}
                  size="sm"
                  className={cn("rounded-lg text-xs h-7 gap-1",
                    mode === tab.key ? "bg-slate-900" : "",
                    isAlert && mode !== tab.key ? "border-amber-300 text-amber-700" : "",
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {count > 0 && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                      mode === tab.key ? "bg-white/20 text-white" : isAlert ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
                    )}>{count}</span>
                  )}
                </Button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {mode === "execution" && ( // filters only for All Tasks tab
              <>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-7 w-28 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none">
                  <option value="">Status</option>
                  {statusOptions.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
                </select>
                <select value={receiverFilter} onChange={(event) => setReceiverFilter(event.target.value)} className="h-7 w-36 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none">
                  <option value="">Receiver Task</option>
                  {receiverOptions.map((receiver) => <option key={receiver} value={receiver}>{receiver}</option>)}
                </select>
                <select value={assignerFilter} onChange={(event) => setAssignerFilter(event.target.value)} className="h-7 w-36 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none">
                  <option value="">Assignee Task</option>
                  {assignerOptions.map((assigner) => <option key={assigner} value={assigner}>{assigner}</option>)}
                </select>
                <select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value)} className="h-7 w-28 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none">
                  <option value="">Progress</option>
                  <option value="not_started">0%</option>
                  <option value="in_progress">1%-99%</option>
                  <option value="completed">100%</option>
                </select>
              </>
            )}
            <span className="text-xs text-slate-500">{activeTabCount[mode as keyof typeof activeTabCount] ?? 0} task{(activeTabCount[mode as keyof typeof activeTabCount] ?? 0) === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {mode === "kpi" ? (
            <WbsTaskKpiPage />
          ) : mode === "kanban" ? (
            <WbsKanbanView tasks={tasks} onEdit={(task) => { router.push(`/dashboard/tasks/${task.id}`); }} />
          ) : (
            <WbsExecutionView
              tasks={mode === "my_tasks" ? myTasks : mode === "overdue" ? overdueTasks : mode === "pending_approval" ? pendingApprovalTasks : filteredExecutionTasks}
              taskAssignerNames={taskAssignerNames}
              onEdit={(task) => { router.push(`/dashboard/tasks/${task.id}`); }}
              onRefresh={refresh}
              onDelete={async (task) => {
                const { data, error } = await deleteWbsTaskByIdReturning(task.id);
                if (error) toast.error(error.message);
                else if (!data) toast.error("Task was not deleted. You may not have delete permission.");
                else { toast.success("Task deleted"); refresh(); }
              }}
            />
          )}
        </div>
      </section>

      {showCreateTask && (
        <WbsTaskEditSheet
          task={null}
          projectId={selectedProjectId}
          wbsNodeId={null}
          wbsNodes={nodes}
          onClose={() => setShowCreateTask(false)}
          onSave={() => { setShowCreateTask(false); refresh(); }}
        />
      )}
    </div>
  );
}
