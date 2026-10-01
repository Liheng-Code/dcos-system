"use client";

import { useEffect, useMemo, useState } from "react";
import { countPlanCalendarsByProjectId, countWbsTasksByProjectId } from "@/lib/planning/planning-queries";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import {
  GanttChartSquare, Loader2, Camera, AlertTriangle, CalendarClock, Gauge, ArrowRight, CheckCircle2, RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { captureProgressSnapshot, getProgressSnapshots } from "@/lib/planning/schedule-service";
import { useSheetData } from "@/components/planning/use-sheet-data";
import type { SheetProject, SheetRow, SheetTask } from "@/components/planning/sheet-types";
import type { TaskFloat } from "@/lib/planning/schedule-engine";
import type { ScheduleKpis } from "@/lib/planning/schedule-kpis";
import { PlanningScurveCard } from "@/components/planning/planning-scurve-card";
import {
  TaskStatusDonutCard, PhaseProgressCard, LookaheadBarsCard, FloatHistogramCard, DelaysByCauseCard,
} from "@/components/planning/planning-dashboard-charts";
import { ManpowerHistogramCard, LevellingDiagramCard, CostLevellingDiagramCard } from "@/components/planning/planning-resource-charts";
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

// ── Dashboard snapshot cache ─────────────────────────────────────────────────
// Everything the Schedule Health strip + its 4 schedule-derived charts need,
// captured after a real fetch and restored from localStorage on the next
// visit instead of re-fetching. The float Map is stored as entries (Maps
// aren't JSON-safe) and rebuilt on read.
interface DashboardSnapshot {
  tasks: SheetTask[];
  tree: SheetRow[];
  kpis: ScheduleKpis;
  floatEntries: [string, TaskFloat][];
  dataDate: string | null;
  project: SheetProject | null;
  counts: Record<string, number>;
  progress: { planned_progress: number | null; actual_progress: number | null } | null;
}

function snapshotCacheKey(projectId: string) {
  return `dcos.planning.dashboard.header.${projectId}`;
}
function readSnapshotCache(projectId: string): { data: DashboardSnapshot; fetchedAt: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(snapshotCacheKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSnapshotCache(projectId: string, data: DashboardSnapshot): string {
  const fetchedAt = new Date().toISOString();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(snapshotCacheKey(projectId), JSON.stringify({ data, fetchedAt }));
    } catch { /* storage full/unavailable — cache is best-effort only */ }
  }
  return fetchedAt;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} day${hr >= 48 ? "s" : ""} ago`;
}

export default function PlanningPage() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [headerData, setHeaderData] = useState<{ counts: Record<string, number>; progress: DashboardSnapshot["progress"] } | null>(null);
  // This page drives its own fetch timing (see the effects below) instead of
  // auto-fetching on every mount like Gantt/Sheet do — that's the whole point
  // of the cache: clicking into Dashboard shows the last-refreshed snapshot
  // instantly, and only the Refresh button (or a first-ever visit with
  // nothing cached yet) hits the network.
  const schedule = useSheetData(selectedProjectId ?? "", false, null, false);

  async function fetchHeader(projectId: string) {
    const [tk, ca, snaps] = await Promise.all([
      countWbsTasksByProjectId(projectId),
      countPlanCalendarsByProjectId(projectId),
      getProgressSnapshots(projectId),
    ]);
    const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
    return {
      counts: { tasks: tk.count ?? 0, calendars: ca.count ?? 0 },
      progress: latest ? { planned_progress: latest.planned_progress, actual_progress: latest.actual_progress } : null,
    };
  }

  async function runRefresh(showToast: boolean) {
    if (!selectedProjectId) return;
    setRefreshing(true);
    try {
      const [header] = await Promise.all([fetchHeader(selectedProjectId), schedule.reload()]);
      setHeaderData(header);
      setRefreshToken((t) => t + 1); // tells every self-fetching chart card to reload too
      if (showToast) toast.success("Dashboard refreshed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh dashboard");
    }
    setRefreshing(false);
  }

  // On project change: trust the cache if we have one (instant, no fetch).
  // Otherwise this browser has never loaded this project's Dashboard before —
  // run one real fetch to seed it.
  useEffect(() => {
    if (!selectedProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing local state when the project selection is cleared
      setSnapshot(null);
      setHeaderData(null);
      setLastRefreshedAt(null);
      return;
    }
    const cached = readSnapshotCache(selectedProjectId);
    if (cached) {
      setSnapshot(cached.data);
      setLastRefreshedAt(cached.fetchedAt);
    } else {
      runRefresh(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately scoped to project changes only; runRefresh reads current closures when it fires
  }, [selectedProjectId]);

  // Capture: whenever a real fetch completes (the initial one above, or an
  // explicit Refresh), `schedule.tasks` gets a fresh reference and this
  // fires, bundling it with whatever `headerData` currently holds into one
  // persisted snapshot. Inert on the cache-hit path, since `headerData` stays
  // null there (no fetch ever ran).
  useEffect(() => {
    if (!selectedProjectId || !headerData) return;
    const snap: DashboardSnapshot = {
      tasks: schedule.tasks,
      tree: schedule.tree,
      kpis: schedule.kpis,
      floatEntries: Array.from(schedule.float.entries()),
      dataDate: schedule.dataDate,
      project: schedule.project,
      counts: headerData.counts,
      progress: headerData.progress,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- captures a completed fetch's result (schedule.tasks changing IS the "fetch finished" signal); it isn't a synthesized derivation of other render state
    setSnapshot(snap);
    setLastRefreshedAt(writeSnapshotCache(selectedProjectId, snap));
  }, [selectedProjectId, headerData, schedule.tasks, schedule.tree, schedule.kpis, schedule.float, schedule.dataDate, schedule.project]);

  async function handleCaptureSnapshot() {
    if (!selectedProjectId) return;
    setCapturing(true);
    try {
      await captureProgressSnapshot(selectedProjectId);
      await runRefresh(false); // a new snapshot changes progress/SPI/S-curve — pull it into the cache too
      toast.success("Snapshot captured");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to capture snapshot");
    }
    setCapturing(false);
  }

  const tasks = useMemo(() => snapshot?.tasks ?? [], [snapshot]);
  const tree = snapshot?.tree ?? [];
  const kpis = snapshot?.kpis ?? null;
  const progress = snapshot?.progress ?? null;
  const counts = snapshot?.counts ?? {};
  const float = useMemo(() => new Map(snapshot?.floatEntries ?? []), [snapshot]);

  const spi = progress?.planned_progress && progress.planned_progress > 0
    ? Math.round(((progress.actual_progress ?? 0) / progress.planned_progress) * 100) / 100
    : null;

  const spiColor = spi === null ? "" : spi >= 1.0 ? "text-green-400" : spi >= 0.9 ? "text-yellow-400" : "text-red-400";

  const asOf = snapshot?.dataDate ?? todayISO();
  // Project start → finish, from the earliest task start to the latest task finish.
  const projectSpan = useMemo(() => {
    let start: string | null = null;
    let end: string | null = null;
    for (const t of tasks) {
      if (t.start_date && (!start || t.start_date < start)) start = t.start_date;
      if (t.end_date && (!end || t.end_date > end)) end = t.end_date;
    }
    return start && end ? { start, end } : null;
  }, [tasks]);

  return (
    <PlanPageShell title="Planning & Scheduling" description="Schedule management, Gantt, CPM, resource loading" icon={GanttChartSquare}>
      <div className="space-y-6">
        {selectedProjectId && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border px-4 py-2.5">
            <span className="text-xs text-muted-foreground">
              {refreshing
                ? "Refreshing…"
                : lastRefreshedAt
                  ? <>Showing data as of last refresh — <strong className="text-foreground">{timeAgo(lastRefreshedAt)}</strong></>
                  : "Loading…"}
            </span>
            <Button variant="outline" size="sm" onClick={() => runRefresh(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        )}

        {/* Schedule Health (Completion Plan 1.4 / 1.5) */}
        {selectedProjectId && kpis && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Schedule Health</h2>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                    PROGRAMME_STATUS_CLASS[kpis.programmeStatus],
                  )}
                >
                  {PROGRAMME_STATUS_LABEL[kpis.programmeStatus]}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleCaptureSnapshot} disabled={capturing}>
                {capturing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
                Capture Progress Snapshot
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Link href="/dashboard/planning/sheet">
                <Card className={cn("h-full transition-colors hover:bg-muted/50", kpis.overdue > 0 && "border-red-500/40")}>
                  <CardContent className="p-4 text-center">
                    <p className={cn("text-2xl font-bold", kpis.overdue > 0 ? "text-red-400" : "text-foreground")}>{kpis.overdue}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/sheet">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{kpis.startingNext14d}</p>
                    <p className="text-xs text-muted-foreground">Starting (14d)</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/sheet">
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{kpis.finishingNext14d}</p>
                    <p className="text-xs text-muted-foreground">Finishing (14d)</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/gantt">
                <Card className={cn("h-full transition-colors hover:bg-muted/50", kpis.negativeFloat > 0 && "border-red-500/40")}>
                  <CardContent className="p-4 text-center">
                    <p className={cn("text-2xl font-bold", kpis.negativeFloat > 0 ? "text-red-400" : "text-foreground")}>{kpis.negativeFloat}</p>
                    <p className="text-xs text-muted-foreground">Critical (0 float)</p>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/dashboard/planning/gantt">
                <Card className={cn("h-full transition-colors hover:bg-muted/50", kpis.nearCritical > 0 && "border-amber-500/40")}>
                  <CardContent className="p-4 text-center">
                    <p className={cn("text-2xl font-bold", kpis.nearCritical > 0 ? "text-amber-400" : "text-foreground")}>{kpis.nearCritical}</p>
                    <p className="text-xs text-muted-foreground">Near-critical</p>
                  </CardContent>
                </Card>
              </Link>
              <Card className="h-full">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{kpis.pcr !== null ? `${kpis.pcr}%` : "—"}</p>
                  <p className="text-xs text-muted-foreground">Last PCR</p>
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardContent className="p-4 text-center">
                  <p className={cn("text-2xl font-bold", spiColor)}>
                    {spi !== null ? spi.toFixed(2) : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">SPI</p>
                </CardContent>
              </Card>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Forecast finish: <strong className="text-foreground">{kpis.forecastFinish ?? "—"}</strong>
              </span>
              {snapshot?.project?.end_date && (
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight className="h-3 w-3" />
                  Contract end: <strong className="text-foreground">{snapshot.project.end_date}</strong>
                </span>
              )}
              {kpis.overrunWd !== null && (
                <span className={cn("inline-flex items-center gap-1.5 font-semibold", kpis.overrunWd > 0 ? "text-red-400" : "text-emerald-400")}>
                  {kpis.overrunWd > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {kpis.overrunWd > 0
                    ? `${kpis.overrunWd} working day${kpis.overrunWd === 1 ? "" : "s"} overrun`
                    : `${Math.abs(kpis.overrunWd)} working day${Math.abs(kpis.overrunWd) === 1 ? "" : "s"} ahead`}
                </span>
              )}
              <span className="ml-auto inline-flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>Tasks: <strong className="text-foreground">{counts.tasks ?? "—"}</strong></span>
                <span>Calendars: <strong className="text-foreground">{counts.calendars ?? "—"}</strong></span>
                <span>Planned: <strong className="text-foreground">{progress ? `${progress.planned_progress ?? 0}%` : "—"}</strong></span>
                <span>Actual: <strong className="text-foreground">{progress ? `${progress.actual_progress ?? 0}%` : "—"}</strong></span>
              </span>
            </div>
          </div>
        )}
        {selectedProjectId && !kpis && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading schedule health…
          </div>
        )}

        {/* Charts (full width) */}
        {selectedProjectId && (
          <>
            <PlanningScurveCard
              projectId={selectedProjectId}
              dataDate={snapshot?.dataDate ?? null}
              refreshKey={refreshToken}
            />
            <div className="grid gap-6 xl:grid-cols-2">
              <TaskStatusDonutCard tasks={tasks} asOf={asOf} loading={!snapshot} />
              <PhaseProgressCard tree={tree} loading={!snapshot} />
            </div>
            <LookaheadBarsCard tasks={tasks} asOf={asOf} loading={!snapshot} />
            {/* Resource charts span the whole project, start to finish, stacked one above the other */}
            <ManpowerHistogramCard projectId={selectedProjectId} asOf={asOf} range={projectSpan} refreshToken={refreshToken} />
            <LevellingDiagramCard projectId={selectedProjectId} asOf={asOf} range={projectSpan} refreshToken={refreshToken} />
            <CostLevellingDiagramCard projectId={selectedProjectId} asOf={asOf} range={projectSpan} refreshToken={refreshToken} />
            <div className="grid gap-6 xl:grid-cols-2">
              <FloatHistogramCard tasks={tasks} float={float} loading={!snapshot} />
              <DelaysByCauseCard projectId={selectedProjectId} refreshToken={refreshToken} />
            </div>
          </>
        )}
        {!selectedProjectId && !projectLoading && (
          <p className="py-4 text-center text-sm text-muted-foreground">Select a project from the sidebar to view planning data.</p>
        )}
      </div>
    </PlanPageShell>
  );
}
