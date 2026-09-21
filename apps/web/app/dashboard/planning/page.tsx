"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import {
  GanttChartSquare, Loader2, Camera, AlertTriangle, CalendarClock, Gauge, ArrowRight, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { captureProgressSnapshot, getProgressSnapshots } from "@/lib/schedule-service";
import { useSheetData } from "@/components/planning/use-sheet-data";
import { PlanningQuickActions } from "@/components/planning/planning-quick-actions";
import { PlanningScurveCard } from "@/components/planning/planning-scurve-card";
import {
  TaskStatusDonutCard, PhaseProgressCard, LookaheadBarsCard, FloatHistogramCard, DelaysByCauseCard,
} from "@/components/planning/planning-dashboard-charts";
import { ManpowerHistogramCard, LevellingDiagramCard } from "@/components/planning/planning-resource-charts";
import { todayISO } from "@/components/planning/sheet-utils";
import { toast } from "sonner";

const PROGRAMME_STATUS_LABEL: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  overrun: "Overrun",
};
const PROGRAMME_STATUS_CLASS: Record<string, string> = {
  on_track: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  at_risk: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  overrun: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function PlanningPage() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [snapshot, setSnapshot] = useState<{ planned_progress: number | null; actual_progress: number | null } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scurveRefresh, setScurveRefresh] = useState(0);
  const supabase = createClient();
  // Reuses the same CPM engine + task load as the Gantt/Sheet pages (Completion
  // Plan 1.4/1.5) rather than re-implementing schedule health here — heavier
  // than the dashboard strictly needs, but it is the module's one source of
  // truth for float/critical/forecast-finish.
  const schedule = useSheetData(selectedProjectId ?? "");

  useEffect(() => {
    if (!selectedProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing local state when the project selection is cleared
      setCounts({});
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("wbs_tasks").select("*", { count: "exact", head: true }).eq("project_id", selectedProjectId),
      supabase.from("plan_calendars").select("*", { count: "exact", head: true }).eq("project_id", selectedProjectId),
      getProgressSnapshots(selectedProjectId),
    ]).then(([tk, ca, snaps]) => {
      setCounts({ tasks: tk.count ?? 0, calendars: ca.count ?? 0 });
      if (snaps.length > 0) {
        const latest = snaps[snaps.length - 1];
        setSnapshot({ planned_progress: latest.planned_progress, actual_progress: latest.actual_progress });
      } else {
        setSnapshot(null);
      }
      setLoading(false);
    });
  }, [selectedProjectId]);

  async function handleCaptureSnapshot() {
    if (!selectedProjectId) return;
    setCapturing(true);
    try {
      await captureProgressSnapshot(selectedProjectId);
      const snaps = await getProgressSnapshots(selectedProjectId);
      if (snaps.length > 0) {
        const latest = snaps[snaps.length - 1];
        setSnapshot({ planned_progress: latest.planned_progress, actual_progress: latest.actual_progress });
      }
      setScurveRefresh((n) => n + 1);
      toast.success("Snapshot captured");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to capture snapshot");
    }
    setCapturing(false);
  }

  const spi = snapshot?.planned_progress && snapshot.planned_progress > 0
    ? Math.round(((snapshot.actual_progress ?? 0) / snapshot.planned_progress) * 100) / 100
    : null;

  const spiColor = spi === null ? "" : spi >= 1.0 ? "text-green-400" : spi >= 0.9 ? "text-yellow-400" : "text-red-400";

  const spinner = <Loader2 className="h-4 w-4 animate-spin inline" />;
  // Same "as of" date the KPI tiles use, so charts and tiles never disagree.
  const asOf = schedule.dataDate ?? todayISO();
  // Project start → finish, from the earliest task start to the latest task finish.
  const projectSpan = useMemo(() => {
    let start: string | null = null;
    let end: string | null = null;
    for (const t of schedule.tasks) {
      if (t.start_date && (!start || t.start_date < start)) start = t.start_date;
      if (t.end_date && (!end || t.end_date > end)) end = t.end_date;
    }
    return start && end ? { start, end } : null;
  }, [schedule.tasks]);

  return (
    <PlanPageShell title="Planning & Scheduling" description="Schedule management, Gantt, CPM, resource loading" icon={GanttChartSquare}>
      <div className="space-y-6">
        {/* Schedule Health (Completion Plan 1.4 / 1.5) */}
        {selectedProjectId && !schedule.loading && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Schedule Health</h2>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                    PROGRAMME_STATUS_CLASS[schedule.kpis.programmeStatus],
                  )}
                >
                  {PROGRAMME_STATUS_LABEL[schedule.kpis.programmeStatus]}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleCaptureSnapshot} disabled={capturing}>
                {capturing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
                Capture Progress Snapshot
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Link href="/dashboard/planning/sheet">
                <Card className={cn("h-full transition-colors hover:bg-muted/50", schedule.kpis.overdue > 0 && "border-red-500/40")}>
                  <CardContent className="p-4 text-center">
                    <p className={cn("text-2xl font-bold", schedule.kpis.overdue > 0 ? "text-red-400" : "text-foreground")}>{schedule.kpis.overdue}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/sheet">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{schedule.kpis.startingNext14d}</p>
                    <p className="text-xs text-muted-foreground">Starting (14d)</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/sheet">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{schedule.kpis.finishingNext14d}</p>
                    <p className="text-xs text-muted-foreground">Finishing (14d)</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/gantt">
                <Card className={cn("h-full transition-colors hover:bg-muted/50", schedule.kpis.negativeFloat > 0 && "border-red-500/40")}>
                  <CardContent className="p-4 text-center">
                    <p className={cn("text-2xl font-bold", schedule.kpis.negativeFloat > 0 ? "text-red-400" : "text-foreground")}>{schedule.kpis.negativeFloat}</p>
                    <p className="text-xs text-muted-foreground">Critical (0 float)</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/gantt">
                <Card className={cn("h-full transition-colors hover:bg-muted/50", schedule.kpis.nearCritical > 0 && "border-amber-500/40")}>
                  <CardContent className="p-4 text-center">
                    <p className={cn("text-2xl font-bold", schedule.kpis.nearCritical > 0 ? "text-amber-400" : "text-foreground")}>{schedule.kpis.nearCritical}</p>
                    <p className="text-xs text-muted-foreground">Near-critical</p>
                  </CardContent>
                </Card>
              </Link>
              <Card className="h-full">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{schedule.kpis.pcr !== null ? `${schedule.kpis.pcr}%` : "—"}</p>
                  <p className="text-xs text-muted-foreground">Last PCR</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardContent className="p-4 text-center">
                  <p className={cn("text-2xl font-bold", spiColor)}>
                    {loading ? spinner : spi !== null ? spi.toFixed(2) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">SPI</p>
                </CardContent>
              </Card>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Forecast finish: <strong className="text-foreground">{schedule.kpis.forecastFinish ?? "—"}</strong>
              </span>
              {schedule.project?.end_date && (
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3" />
                  Contract end: <strong className="text-foreground">{schedule.project.end_date}</strong>
                </span>
              )}
              {schedule.kpis.overrunWd !== null && (
                <span className={cn("inline-flex items-center gap-1.5 font-semibold", schedule.kpis.overrunWd > 0 ? "text-red-400" : "text-emerald-400")}>
                  {schedule.kpis.overrunWd > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {schedule.kpis.overrunWd > 0
                    ? `${schedule.kpis.overrunWd} working day${schedule.kpis.overrunWd === 1 ? "" : "s"} overrun`
                    : `${Math.abs(schedule.kpis.overrunWd)} working day${Math.abs(schedule.kpis.overrunWd) === 1 ? "" : "s"} ahead`}
                </span>
              )}
              <span className="ml-auto inline-flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>Tasks: <strong className="text-foreground">{loading ? spinner : counts.tasks ?? "—"}</strong></span>
                <span>Calendars: <strong className="text-foreground">{loading ? spinner : counts.calendars ?? "—"}</strong></span>
                <span>Planned: <strong className="text-foreground">{loading ? spinner : snapshot ? `${snapshot.planned_progress ?? 0}%` : "—"}</strong></span>
                <span>Actual: <strong className="text-foreground">{loading ? spinner : snapshot ? `${snapshot.actual_progress ?? 0}%` : "—"}</strong></span>
              </span>
            </div>
          </div>
        )}

        {/* Charts (full width) */}
        {selectedProjectId && (
          <>
            <PlanningScurveCard
              projectId={selectedProjectId}
              dataDate={schedule.dataDate}
              refreshKey={scurveRefresh}
            />
            <div className="grid gap-6 xl:grid-cols-2">
              <TaskStatusDonutCard tasks={schedule.tasks} asOf={asOf} loading={schedule.loading} />
              <PhaseProgressCard tree={schedule.tree} loading={schedule.loading} />
            </div>
            <LookaheadBarsCard tasks={schedule.tasks} asOf={asOf} loading={schedule.loading} />
            {/* Resource charts span the whole project, start to finish, stacked one above the other */}
            <ManpowerHistogramCard projectId={selectedProjectId} asOf={asOf} range={projectSpan} />
            <LevellingDiagramCard projectId={selectedProjectId} asOf={asOf} range={projectSpan} />
            <div className="grid gap-6 xl:grid-cols-2">
              <FloatHistogramCard tasks={schedule.tasks} float={schedule.float} loading={schedule.loading} />
              <DelaysByCauseCard projectId={selectedProjectId} />
            </div>
          </>
        )}
        {!selectedProjectId && !projectLoading && (
          <p className="py-4 text-center text-sm text-muted-foreground">Select a project from the sidebar to view planning data.</p>
        )}

        {/* Quick Actions — last */}
        <PlanningQuickActions />
      </div>
    </PlanPageShell>
  );
}
