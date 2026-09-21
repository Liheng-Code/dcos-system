"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ReportExport } from "@/components/reports/layout/report-export";
import { getTaskStatus } from "@/components/planning/task-status";
import { PlanDelayAnalysis } from "@/components/planning/plan-delay-analysis";

const SUB_TAB_IDS = ["delay", "summary", "milestone"] as const;
type ReportType = (typeof SUB_TAB_IDS)[number];

interface TaskSummary {
  id: string; task_code: string; task_name: string; status: string;
  discipline: string | null; delay_status: string; delay_reason: string | null;
  priority: string; start_date: string | null; end_date: string | null;
  progress: number; is_milestone: boolean;
  owner_name: string | null;
  baseline_finish_date: string | null;
}

export function PlanScheduleReports() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as ReportType | null;
  const reportType: ReportType = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "delay";
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // The "delay" sub-tab renders <PlanDelayAnalysis/>, which loads its own data.
    if (!selectedProjectId || reportType === "delay") { setTasks([]); setLoading(false); return; }
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    supabase.from("wbs_tasks").select(
      "id, task_code, task_name, status, discipline, delay_status, delay_reason, priority, start_date, end_date, progress, is_milestone, owner_name, baseline_finish_date"
    ).eq("project_id", selectedProjectId).limit(500).then(({ data, error }) => {
      if (error) toast.error(error.message);
      else setTasks((data || []) as TaskSummary[]);
      setLoading(false);
    });
  }, [supabase, selectedProjectId, reportType]);

  const milestoneTasks = useMemo(() =>
    tasks.filter(t => t.is_milestone),
    [tasks]
  );

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  if (projectLoading || loading) return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Select a project to view reports.</div>;

  return (
    <div className="space-y-4">
      {/* Report content */}
      {reportType === "delay" && <PlanDelayAnalysis />}

      {reportType === "summary" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{tasks.length} total tasks</p>
            <ReportExport
              data={tasks.map((t) => ({
                task_code: t.task_code,
                task_name: t.task_name,
                discipline: t.discipline,
                status: t.status,
                progress: t.progress,
                delay_status: t.delay_status,
              }))}
              columns={[
                { key: "task_code", label: "Task Code" },
                { key: "task_name", label: "Task Name" },
                { key: "discipline", label: "Discipline" },
                { key: "status", label: "Status" },
                { key: "progress", label: "Progress (%)" },
                { key: "delay_status", label: "Delay Status" },
              ]}
              filename="schedule-summary"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Object.entries(statusBreakdown).map(([status, count]) => (
              <Card key={status}><CardContent className="p-3 text-center">
                <p className="text-xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground capitalize">{status.replace(/_/g, " ")}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card><CardContent className="p-4">
            <p className="text-sm font-semibold mb-2">Discipline Breakdown</p>
            <div className="space-y-2">
              {Object.entries(
                tasks.reduce((acc, t) => {
                  const d = t.discipline || "Other";
                  if (!acc[d]) acc[d] = { total: 0, delayed: 0 };
                  acc[d].total++;
                  if (t.delay_status === "delayed" || t.delay_status === "blocked") acc[d].delayed++;
                  return acc;
                }, {} as Record<string, { total: number; delayed: number }>)
              ).map(([discipline, counts]) => (
                <div key={discipline} className="flex items-center justify-between text-sm">
                  <span>{discipline}</span>
                  <span className="text-muted-foreground">
                    {counts.total} tasks
                    {counts.delayed > 0 && <span className="text-red-500 ml-1">({counts.delayed} delayed)</span>}
                  </span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </div>
      )}

      {reportType === "milestone" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{milestoneTasks.length} milestone tasks</p>
            <ReportExport
              data={milestoneTasks.map((t) => ({
                task_code: t.task_code,
                task_name: t.task_name,
                owner: t.owner_name,
                baseline_finish: t.baseline_finish_date?.slice(0, 10),
                target_date: t.end_date?.slice(0, 10),
                progress: t.progress,
                status: t.status,
              }))}
              columns={[
                { key: "task_code", label: "Task Code" },
                { key: "task_name", label: "Task Name" },
                { key: "owner", label: "Owner" },
                { key: "baseline_finish", label: "Baseline Finish" },
                { key: "target_date", label: "Target Date" },
                { key: "progress", label: "Progress (%)" },
                { key: "status", label: "Status" },
              ]}
              filename="schedule-milestones"
            />
          </div>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Task</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Owner</th>
                  <th className="px-3 py-2 text-center font-medium">Baseline Finish</th>
                  <th className="px-3 py-2 text-center font-medium">Target Date</th>
                  <th className="px-3 py-2 text-center font-medium">Variance</th>
                  <th className="px-3 py-2 text-center font-medium">Progress</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {milestoneTasks.map(t => {
                  const { label: msStatus, badgeClass: statusColor } = getTaskStatus(t);
                  const varianceDays = t.baseline_finish_date && t.end_date
                    ? Math.round((new Date(t.end_date).getTime() - new Date(t.baseline_finish_date).getTime()) / 86400000)
                    : null;
                  return (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{t.task_code}</td>
                      <td className="px-3 py-2">{t.task_name}</td>
                      <td className="px-3 py-2">{t.owner_name || "—"}</td>
                      <td className="px-3 py-2 text-center text-muted-foreground">{t.baseline_finish_date?.slice(0, 10) || "—"}</td>
                      <td className="px-3 py-2 text-center">{t.end_date?.slice(0, 10) || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {varianceDays === null ? "—" : (
                          <span className={varianceDays > 0 ? "text-red-600 font-medium" : varianceDays < 0 ? "text-green-600 font-medium" : ""}>
                            {varianceDays > 0 ? "+" : ""}{varianceDays}d
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{t.progress}%</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>{msStatus}</span>
                      </td>
                    </tr>
                  );
                })}
                {!milestoneTasks.length && <tr><td colSpan={8} className="text-center py-4 text-sm">No milestone tasks defined.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
