"use client";

import { useEffect, useState, useRef } from "react";
import {
  getModuleTaskSummary,
  getModuleApprovalSummary,
  pivotTaskSummary,
  type DisciplineSummary,
  type ApprovalSummaryRow,
} from "@/lib/reporting/insights-service";
import { ModuleOverviewCards } from "@/components/insights/module-overview-cards";
import { TaskStatusTable } from "@/components/insights/task-status-table";
import { ApprovalPipelineTable } from "@/components/insights/approval-pipeline-table";
import { BarChart2 } from "lucide-react";
import { ReportExport } from "@/components/reports/layout/report-export";
import { useRouter } from "next/navigation";
import { useProject } from "@/components/dashboard/project-context";

export default function ModuleInsightPage() {
  const router = useRouter();
  const { selectedProjectId } = useProject();
  const [disciplines, setDisciplines] = useState<DisciplineSummary[]>([]);
  const [approvals, setApprovals] = useState<ApprovalSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevDisciplinesRef = useRef<DisciplineSummary[]>([]);

  // Reload insight data when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    loadInsights(selectedProjectId);
  }, [selectedProjectId]);

  async function loadInsights(projectId: string) {
    setLoading(true);
    setError(null);
    try {
      const [taskRows, approvalRows] = await Promise.all([
        getModuleTaskSummary(projectId),
        getModuleApprovalSummary(projectId),
      ]);
      const newDisciplines = pivotTaskSummary(taskRows);
      prevDisciplinesRef.current = disciplines;
      setDisciplines(newDisciplines);
      setApprovals(approvalRows);
    } catch (e: any) {
      setError(e.message ?? "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <BarChart2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Module Insights</h1>
          <p className="text-sm text-muted-foreground">
            Task status summary by discipline module
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && disciplines.length === 0 && selectedProjectId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-20 text-center">
          <BarChart2 className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No tasks found</p>
          <p className="mt-1 text-xs text-slate-400">
            This project has no tasks yet, or no tasks are linked to a discipline.
          </p>
        </div>
      )}

      {/* No project selected */}
      {!selectedProjectId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-20 text-center">
          <BarChart2 className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Select a project to view insights</p>
        </div>
      )}

      {/* Content */}
      {disciplines.length > 0 && (
        <>
          {/* Section: Overview cards */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Module Overview
              </h2>
              <ReportExport
                data={disciplines.map((d) => ({
                  discipline: d.discipline,
                  totalTasks: d.totalTasks,
                  avgProgress: d.avgProgress,
                  overdueCount: d.overdueCount,
                  totalBudget: d.totalBudget,
                  totalActual: d.totalActual,
                  costVariancePct: d.costVariancePct,
                }))}
                columns={[
                  { key: "discipline", label: "Module" },
                  { key: "totalTasks", label: "Total Tasks" },
                  { key: "avgProgress", label: "Avg Progress (%)" },
                  { key: "overdueCount", label: "Overdue" },
                  { key: "totalBudget", label: "Total Budget" },
                  { key: "totalActual", label: "Total Actual" },
                  { key: "costVariancePct", label: "Cost Variance (%)" },
                ]}
                filename="insights-module-overview"
                label="Export Overview"
              />
            </div>
            <ModuleOverviewCards disciplines={disciplines} previousDisciplines={prevDisciplinesRef.current} loading={loading} />
          </section>

          {/* Section: Task status distribution */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Task Status by Module
              </h2>
              <ReportExport
                data={disciplines.flatMap((d) =>
                  Object.entries(d.statusCounts).map(([status, count]) => ({
                    discipline: d.discipline,
                    status,
                    count,
                  })),
                )}
                columns={[
                  { key: "discipline", label: "Module" },
                  { key: "status", label: "Status" },
                  { key: "count", label: "Count" },
                ]}
                filename="insights-task-status"
                label="Export Status"
              />
            </div>
            <TaskStatusTable disciplines={disciplines} loading={loading} onDrillDown={(discipline) => router.push(`/dashboard/tasks`)} />
          </section>

          {/* Section: Approval pipeline */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Approval Pipeline by Module
              </h2>
              <ReportExport
                data={approvals.map((a) => ({
                  discipline: a.discipline,
                  pending_review: Number(a.pending_review),
                  pending_approval: Number(a.pending_approval),
                  approved: Number(a.approved),
                  rejected: Number(a.rejected),
                }))}
                columns={[
                  { key: "discipline", label: "Module" },
                  { key: "pending_review", label: "Pending Review" },
                  { key: "pending_approval", label: "Pending Approval" },
                  { key: "approved", label: "Approved" },
                  { key: "rejected", label: "Rejected" },
                ]}
                filename="insights-approval-pipeline"
                label="Export Approvals"
              />
            </div>
            <ApprovalPipelineTable approvals={approvals} loading={loading} />
          </section>
        </>
      )}
    </div>
  );
}
