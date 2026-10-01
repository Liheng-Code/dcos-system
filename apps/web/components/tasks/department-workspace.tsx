"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarRange, ClipboardList, Columns3, Loader2, RefreshCw, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { WbsExecutionView } from "@/components/wbs/wbs-execution-view";
import { WbsKanbanView } from "@/components/wbs/wbs-kanban-view";
import { WbsTaskEditSheet } from "@/components/wbs/wbs-task-edit-sheet";
import {
  type WbsAuditLogRecord,
  type WbsNodeRecord,
  type WbsTaskRecord,
} from "@/components/wbs/wbs-types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  canPlanTeam,
  canViewDepartmentTasks,
  isActiveTask,
  resolveViewer,
  type TaskViewer,
} from "@/lib/task-scope";
import { TeamPlannerGrid } from "@/components/tasks/team-planner-grid";
import { deleteWbsTaskByIdReturning, listProfilesByDepartmentIds, listWbsAuditLogWithFieldNameOwnerName, listWbsNodesByProjectId, listWbsTasksByDepartmentIds } from "@/lib/tasks/tasks-queries";

interface MemberRecord {
  id: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
}

type DeptTab = "team_tasks" | "team_planning";
type TaskView = "table" | "kanban";

export function DepartmentWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { selectedProjectId } = useProject();
  const [viewer, setViewer] = useState<TaskViewer | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [tab, setTab] = useState<DeptTab>("team_tasks");
  const [taskView, setTaskView] = useState<TaskView>("table");
  const [loading, setLoading] = useState(true);
  const [scopeAllProjects, setScopeAllProjects] = useState(!selectedProjectId);

  const [tasks, setTasks] = useState<WbsTaskRecord[]>([]);
  const [nodes, setNodes] = useState<WbsNodeRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [memberFilter, setMemberFilter] = useState("");
  const [assignerNames, setAssignerNames] = useState<Record<string, string>>({});

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  useEffect(() => {
    resolveViewer(supabase)
      .then((v) => {
        setViewer(v);
        if (!v) setViewerError("Your profile could not be loaded. Check that your account has a profile row linked to a department.");
      })
      .catch((err: unknown) => {
        setViewerError(err instanceof Error ? err.message : "Failed to resolve your account permissions.");
      })
      .finally(() => {
        setViewerReady(true);
      });
  }, [supabase]);

  // "All projects" is forced when no project is selected.
  const effectiveAllProjects = scopeAllProjects || !selectedProjectId;

  const refresh = useCallback(async () => {
    if (!viewer) {
      setTasks([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    if (viewer.managedDepartmentIds.length === 0) {
      setTasks([]);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = listWbsTasksByDepartmentIds(viewer.managedDepartmentIds);
    if (!effectiveAllProjects && selectedProjectId) {
      query = query.eq("project_id", selectedProjectId);
    }
    const [tasksRes, membersRes, nodesRes, logsRes] = await Promise.all([
      query.order("sort_order", { ascending: true, nullsFirst: false }).limit(1000),
      listProfilesByDepartmentIds(viewer.managedDepartmentIds),
      effectiveAllProjects || !selectedProjectId
        ? Promise.resolve({ data: [] as WbsNodeRecord[] })
        : listWbsNodesByProjectId(selectedProjectId),
      listWbsAuditLogWithFieldNameOwnerName(),
    ]);

    const taskRecords = (tasksRes.data ?? []) as WbsTaskRecord[];
    const profileNames = new Map(
      ((membersRes.data ?? []) as MemberRecord[]).map((m) => [m.id, m.full_name]),
    );
    const names: Record<string, string> = {};
    for (const log of (logsRes.data ?? []) as WbsAuditLogRecord[]) {
      if (!log.wbs_task_id || names[log.wbs_task_id]) continue;
      names[log.wbs_task_id] = log.user_id ? profileNames.get(log.user_id) ?? "Unknown" : "Unknown";
    }
    setTasks(taskRecords);
    setMembers((membersRes.data ?? []) as MemberRecord[]);
    setNodes((nodesRes.data ?? []) as WbsNodeRecord[]);
    setAssignerNames(names);
    setLoading(false);
  }, [supabase, viewer, effectiveAllProjects, selectedProjectId]);

  useEffect(() => {
    if (viewerReady) void Promise.resolve().then(refresh);
  }, [viewerReady, refresh]);

  const filteredTasks = useMemo(() => {
    if (!memberFilter) return tasks;
    return tasks.filter((t) => t.owner_id === memberFilter);
  }, [tasks, memberFilter]);

  const activeCounts = useMemo(
    () => ({
      total: tasks.length,
      active: tasks.filter(isActiveTask).length,
      overdue: tasks.filter((t) => isActiveTask(t) && t.end_date && t.end_date < new Date().toISOString().slice(0, 10)).length,
      unassigned: tasks.filter((t) => isActiveTask(t) && !t.owner_id).length,
    }),
    [tasks],
  );

  const editingTask = useMemo(
    () => tasks.find((t) => t.id === editingTaskId) ?? null,
    [tasks, editingTaskId],
  );

  const openTaskDetail = useCallback((task: WbsTaskRecord) => {
    router.push(`/dashboard/tasks/${task.id}`);
  }, [router]);

  if (!viewerReady || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (viewerError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
        <Building2 className="h-8 w-8 opacity-40" />
        <p className="text-sm font-medium text-red-600">Could not load the department workspace</p>
        <p className="max-w-md text-center text-xs">{viewerError}</p>
      </div>
    );
  }

  if (!canViewDepartmentTasks(viewer)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
        <Building2 className="h-8 w-8 opacity-40" />
        <p className="text-sm font-medium">No department assigned</p>
        <p className="text-xs">Department views become available once your profile is linked to a department.</p>
      </div>
    );
  }

  const isManager = canPlanTeam(viewer);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-xs font-medium text-slate-500">DCOS / Department</div>
          <h1 className="text-xl font-bold tracking-tight">{viewer.departmentName ?? "Department"}</h1>
          <div className="mt-0.5 text-xs text-slate-500">
            Team workspace · {activeCounts.active} active · {activeCounts.overdue} overdue · {activeCounts.unassigned} unassigned
            {!viewer.isDeptHead && " · read-only"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!effectiveAllProjects && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-lg text-xs"
              onClick={() => setScopeAllProjects(true)}
            >
              All projects
            </Button>
          )}
          {selectedProjectId && (
            <Button
              size="sm"
              variant={effectiveAllProjects ? "secondary" : "outline"}
              className="h-7 rounded-lg text-xs"
              onClick={() => setScopeAllProjects(false)}
            >
              Selected project
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1 rounded-lg text-xs" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {([
            { key: "team_tasks", label: "My Team Tasks", icon: ClipboardList },
            { key: "team_planning", label: "Team Planning", icon: CalendarRange },
          ] as const).map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              size="sm"
              variant={tab === key ? "default" : "outline"}
              className={cn("h-7 gap-1 rounded-lg text-xs", tab === key && "bg-slate-900")}
              onClick={() => setTab(key)}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {tab === "team_tasks" && (
            <>
              <div className="flex gap-1">
                {([["table", Table2], ["kanban", Columns3]] as const).map(([view, Icon]) => (
                  <Button
                    key={view}
                    size="sm"
                    variant={taskView === view ? "default" : "outline"}
                    className={cn("h-7 w-7 rounded-lg p-0", taskView === view && "bg-slate-900")}
                    onClick={() => setTaskView(view)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                ))}
              </div>
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="h-7 w-44 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none"
              >
                <option value="">All members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </>
          )}
          <span className="text-xs text-slate-500">{filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {tab === "team_planning" ? (
            <TeamPlannerGrid
              tasks={tasks}
              members={members.map(({ id, full_name, job_title }) => ({ id, full_name, job_title }))}
              canPlan={isManager}
              projectId={effectiveAllProjects ? null : selectedProjectId}
              departmentId={(viewer?.departmentId ?? viewer?.managedDepartmentIds[0]) ?? null}
              viewerUserId={viewer?.userId ?? null}
              onTaskMoved={() => void refresh()}
              onOpenTask={openTaskDetail}
            />
          ) : taskView === "kanban" ? (
            <WbsKanbanView tasks={filteredTasks} onEdit={(task) => router.push(`/dashboard/tasks/${task.id}`)} />
          ) : (
            <WbsExecutionView
              tasks={filteredTasks}
              taskAssignerNames={assignerNames}
              onEdit={(task) => {
                if (!isManager) {
                  openTaskDetail(task);
                  return;
                }
                setEditingTaskId(task.id);
              }}
              onDelete={async (task) => {
                if (!isManager) {
                  toast.error("Only department managers can delete team tasks");
                  return;
                }
                const { data, error } = await deleteWbsTaskByIdReturning(task.id);
                if (error) toast.error(error.message);
                else if (!data) toast.error("Task was not deleted. You may not have delete permission.");
                else { toast.success("Task deleted"); refresh(); }
              }}
              onRefresh={refresh}
            />
          )}
        </div>
      </section>

      {editingTask && editingTask.project_id && (
        <WbsTaskEditSheet
          task={editingTask}
          projectId={editingTask.project_id}
          wbsNodeId={null}
          wbsNodes={nodes}
          onClose={() => setEditingTaskId(null)}
          onSave={() => { setEditingTaskId(null); void refresh(); }}
        />
      )}
    </div>
  );
}
