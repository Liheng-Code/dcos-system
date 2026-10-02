"use client";

import { useCallback, useEffect, useState } from "react";
import { listWbsAuditLogByProjectIdWithActionProgressUpdatedApprovedRejected, listWbsTasksByProjectId } from "@/lib/project/wbs/wbs-queries";
import { useProject } from "@/components/dashboard/project-context";
import { Loader2, CheckCircle2, Clock3, AlertTriangle, ThumbsUp } from "lucide-react";

interface KpiData {
  completionRate: number | null;
  totalTasks: number;
  completedTasks: number;
  avgApprovalDays: number | null;
  overdueCount: number;
  overduePercent: number | null;
  firstTimeApprovalRate: number | null;
  firstTimeApproved: number;
  totalApproved: number;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm flex flex-col gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

export function WbsTaskKpiPage() {
  const { selectedProjectId } = useProject();
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData | null>(null);

  const refresh = useCallback(async () => {
    if (!selectedProjectId) { setLoading(false); return; }
    setLoading(true);

    const today = new Date().toISOString().slice(0, 10);

    const { data: tasks } = await listWbsTasksByProjectId(selectedProjectId, "id, status, end_date, qa_status");

    if (!tasks) { setLoading(false); return; }

    const total = tasks.filter((t) => t.status !== "cancelled").length;
    const completed = tasks.filter((t) => ["closed", "completed", "approved"].includes(t.status)).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;

    const overdueCount = tasks.filter((t) =>
      t.end_date && t.end_date < today && !["closed", "cancelled", "completed", "approved"].includes(t.status)
    ).length;
    const overduePercent = total > 0 ? Math.round((overdueCount / total) * 100) : null;

    const approvedTasks = tasks.filter((t) => ["approved", "completed", "closed"].includes(t.status));
    const totalApproved = approvedTasks.length;

    const { data: auditLogs } = await listWbsAuditLogByProjectIdWithActionProgressUpdatedApprovedRejected(selectedProjectId);

    let totalDays = 0;
    let approvalCount = 0;
    let firstTimeApproved = 0;

    const rejectedTaskIds = new Set(
      (auditLogs ?? []).filter((l) => l.action === "Rejected").map((l) => l.wbs_task_id)
    );

    for (const task of approvedTasks) {
      if (!rejectedTaskIds.has(task.id)) firstTimeApproved++;
    }

    const submitLogs = (auditLogs ?? []).filter((l) => l.action === "Progress Updated");
    const approveLogs = (auditLogs ?? []).filter((l) => l.action === "Approved");

    for (const approveLog of approveLogs) {
      const submit = submitLogs.filter((l) => l.wbs_task_id === approveLog.wbs_task_id).at(-1);
      if (submit) {
        const days = (new Date(approveLog.created_at).getTime() - new Date(submit.created_at).getTime()) / 86_400_000;
        totalDays += days;
        approvalCount++;
      }
    }

    const avgApprovalDays = approvalCount > 0 ? Math.round((totalDays / approvalCount) * 10) / 10 : null;
    const firstTimeApprovalRate = totalApproved > 0 ? Math.round((firstTimeApproved / totalApproved) * 100) : null;

    setKpi({ completionRate, totalTasks: total, completedTasks: completed, avgApprovalDays, overdueCount, overduePercent, firstTimeApprovalRate, firstTimeApproved, totalApproved });
    setLoading(false);
  }, [selectedProjectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Select a project to view KPIs
      </div>
    );
  }

  if (!kpi) return null;

  return (
    <div className="space-y-5 p-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Task KPIs</h2>
        <p className="text-xs text-muted-foreground">Performance metrics for the selected project</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={CheckCircle2}
          label="Completion Rate"
          value={kpi.completionRate !== null ? `${kpi.completionRate}%` : "—"}
          sub={`${kpi.completedTasks} of ${kpi.totalTasks} tasks done`}
          color="bg-emerald-100 text-emerald-700"
        />
        <KpiCard
          icon={Clock3}
          label="Avg Approval Time"
          value={kpi.avgApprovalDays !== null ? `${kpi.avgApprovalDays}d` : "—"}
          sub="Submit to approval"
          color="bg-blue-100 text-blue-700"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Overdue Tasks"
          value={kpi.overduePercent !== null ? `${kpi.overduePercent}%` : "—"}
          sub={`${kpi.overdueCount} tasks past due date`}
          color={kpi.overdueCount > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}
        />
        <KpiCard
          icon={ThumbsUp}
          label="First-Time Approval"
          value={kpi.firstTimeApprovalRate !== null ? `${kpi.firstTimeApprovalRate}%` : "—"}
          sub={`${kpi.firstTimeApproved} of ${kpi.totalApproved} approved without rework`}
          color="bg-violet-100 text-violet-700"
        />
      </div>
    </div>
  );
}
