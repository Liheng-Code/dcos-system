"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Loader2, RefreshCw, Timer, TrendingUp, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWbsTasksByProjectId } from "@/lib/dashboard/dashboard-queries";
import { getProgressSnapshots, captureProgressSnapshot, type ProgressSnapshotRow } from "@/lib/planning/schedule-service";
import { cn } from "@/lib/utils";
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, ComposedChart,
} from "recharts";
import { toast } from "sonner";

interface Task {
  id: string; task_code: string; task_name: string; status: string; progress: number;
  priority: string; discipline: string | null; start_date: string | null; end_date: string | null;
  delay_status: string; owner_name: string | null;
}

interface Props { projectId: string; projectName?: string; projectProgress?: number }

const taskStatus = (status: string) => status === "closed" ? "Complete" : status === "in_progress" ? "In progress" : status === "review" ? "In review" : "Not started";

export function ProgressDashboard({ projectId, projectName, projectProgress = 0 }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [snapshots, setSnapshots] = useState<ProgressSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [today, setToday] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksResult, snapshotsResult] = await Promise.all([
        listWbsTasksByProjectId(projectId),
        getProgressSnapshots(projectId),
      ]);
      if (tasksResult.error) throw tasksResult.error;
      setTasks((tasksResult.data ?? []) as Task[]);
      setSnapshots(snapshotsResult);
      setToday(new Date().toISOString().slice(0, 10));
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function handleCapture() {
    setCapturing(true);
    try {
      await captureProgressSnapshot(projectId);
      toast.success("Progress snapshot captured");
      await load();
    } catch {
      toast.error("Failed to capture snapshot");
    } finally {
      setCapturing(false);
    }
  }

  const metrics = useMemo(() => {
    const complete = tasks.filter((task) => task.status === "closed" || Number(task.progress) >= 100).length;
    const active = tasks.filter((task) => task.status === "in_progress").length;
    const atRisk = tasks.filter((task) => ["risk", "delayed", "blocked"].includes(task.delay_status) || (!!today && !!task.end_date && task.end_date < today && Number(task.progress) < 100)).length;
    const calculatedProgress = tasks.length ? tasks.reduce((sum, task) => sum + Number(task.progress), 0) / tasks.length : projectProgress;
    return { complete, active, atRisk, progress: calculatedProgress };
  }, [projectProgress, tasks, today]);

  const disciplines = useMemo(() => Object.values(tasks.reduce<Record<string, { name: string; count: number; progress: number }>>((all, task) => {
    const name = task.discipline || "General works";
    if (!all[name]) all[name] = { name, count: 0, progress: 0 };
    all[name].count += 1; all[name].progress += Number(task.progress);
    return all;
  }, {})).map((item) => ({ ...item, progress: item.count ? item.progress / item.count : 0 })).sort((a, b) => b.progress - a.progress), [tasks]);

  const upcoming = useMemo(() => tasks.filter((task) => task.status !== "closed" && task.end_date).slice(0, 5), [tasks]);
  const attention = useMemo(() => tasks.filter((task) => ["risk", "delayed", "blocked"].includes(task.delay_status) || task.priority === "critical").slice(0, 4), [tasks]);

  const scurveData = useMemo(() => {
    if (snapshots.length === 0) return [];
    return snapshots
      .filter((s) => s.snapshot_date)
      .map((s) => ({
        date: new Date(s.snapshot_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        Planned: s.planned_progress ?? 0,
        Actual: s.actual_progress ?? 0,
      }));
  }, [snapshots]);

  const latestSnapshot = snapshots[snapshots.length - 1];
  const variance = latestSnapshot ? ((latestSnapshot.actual_progress ?? 0) - (latestSnapshot.planned_progress ?? 0)) : 0;
  const spi = latestSnapshot && (latestSnapshot.planned_progress ?? 0) > 0
    ? (latestSnapshot.actual_progress ?? 0) / (latestSnapshot.planned_progress ?? 0)
    : 1;

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <section className="rounded-xl bg-slate-950 px-5 py-4 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><div className="mb-1 flex items-center gap-2"><span className="rounded bg-violet-400/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-violet-200">LIVE</span><span className="text-[11px] font-medium text-slate-300">PROJECT PROGRESS</span></div><h2 className="text-base font-semibold">{projectName || "Selected Project"}</h2><p className="mt-1 text-xs text-slate-400">Execution status, schedule health, and delivery priorities</p></div>
          <Button variant="outline" size="sm" onClick={load} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Overall progress" value={`${metrics.progress.toFixed(1)}%`} note="Weighted from current WBS tasks" tone="violet" />
        <Metric title="Completed tasks" value={`${metrics.complete}`} note={`of ${tasks.length} tasks in the plan`} tone="emerald" />
        <Metric title="Active work fronts" value={`${metrics.active}`} note="Tasks currently in progress" tone="blue" />
        <Metric title="Needs attention" value={`${metrics.atRisk}`} note="Delayed, blocked, or at-risk tasks" tone={metrics.atRisk ? "amber" : "emerald"} />
      </div>

      {/* ── S-Curve ── */}
      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">S-Curve</h3>
              <p className="text-[11px] text-muted-foreground">Planned vs actual progress over time</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={loading} onClick={load}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" disabled={capturing} onClick={handleCapture}>
              {capturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
              Snapshot
            </Button>
          </div>
        </div>

        {scurveData.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="mb-2 h-7 w-7 text-muted-foreground/50" />
            <p className="text-xs font-medium text-muted-foreground">Not enough snapshots for S-Curve</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Capture at least 2 progress snapshots to visualize the trend.</p>
          </div>
        ) : (
          <>
            {/* Mini KPI strip */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ScurveKpi label="Planned" value={`${latestSnapshot?.planned_progress?.toFixed(1) ?? 0}%`} />
              <ScurveKpi label="Actual" value={`${latestSnapshot?.actual_progress?.toFixed(1) ?? 0}%`} />
              <ScurveKpi
                label="Variance"
                value={`${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%`}
                tone={variance >= 0 ? "emerald" : "red"}
              />
              <ScurveKpi
                label="SPI"
                value={spi.toFixed(2)}
                tone={spi >= 1 ? "emerald" : spi >= 0.9 ? "amber" : "red"}
              />
            </div>

            {/* Chart */}
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={scurveData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
                    formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="circle" iconSize={6} />
                  <ReferenceLine y={100} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="Actual" stroke="none" fill="#8b5cf6" fillOpacity={0.08} />
                  <Line type="monotone" dataKey="Planned" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 2.5, fill: "#94a3b8", strokeWidth: 0 }} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Actual" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3, fill: "#7c3aed", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-600" />
          <div className="mb-5 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-foreground">Progress by workstream</h3><p className="mt-0.5 text-[11px] text-muted-foreground">Average completion across WBS task disciplines</p></div><ClipboardList className="h-4 w-4 text-muted-foreground" /></div>
          {disciplines.length === 0 ? <Empty text="Add WBS tasks to start tracking progress." /> : <div className="space-y-4">{disciplines.slice(0, 6).map((item) => <div key={item.name}><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-foreground">{item.name}</span><span className="text-muted-foreground">{item.progress.toFixed(0)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(item.progress, 100)}%` }} /></div><p className="mt-1 text-[11px] text-muted-foreground">{item.count} task{item.count === 1 ? "" : "s"}</p></div>)}</div>}
        </section>
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
          <div className="mb-4 flex items-center gap-2"><div className="relative flex h-16 w-16 items-center justify-center rounded-full border-[7px] border-violet-100"><span className="text-sm font-bold text-violet-700">{metrics.progress.toFixed(0)}%</span></div><div><h3 className="text-sm font-semibold text-foreground">Plan completion</h3><p className="mt-1 text-[11px] text-muted-foreground">Current task progress across the selected project</p></div></div>
          <div className="space-y-2 border-t border-border pt-3"><SmallRow label="Not started" value={tasks.filter((task) => task.status === "open").length} /><SmallRow label="In review / submitted" value={tasks.filter((task) => ["review", "submitted"].includes(task.status)).length} /><SmallRow label="Blocked" value={tasks.filter((task) => task.delay_status === "blocked").length} danger /></div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm"><div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 to-blue-600" /><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">Upcoming milestones</h3><CalendarDays className="h-4 w-4 text-muted-foreground" /></div>{upcoming.length === 0 ? <Empty text="No scheduled upcoming tasks." /> : <div className="divide-y divide-border">{upcoming.map((task) => <div key={task.id} className="flex items-center gap-3 py-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Timer className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{task.task_name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{task.task_code} · Due {task.end_date}</p></div><span className="text-xs font-semibold text-foreground">{Number(task.progress)}%</span></div>)}</div>}<Link href="/dashboard/wbs" className="mt-3 block text-right text-[11px] font-medium text-primary hover:underline">Open WBS workspace →</Link></section>
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm"><div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-600" /><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">Execution attention</h3><AlertTriangle className={cn("h-4 w-4", attention.length ? "text-amber-500" : "text-emerald-500")} /></div>{attention.length === 0 ? <div className="flex min-h-36 flex-col items-center justify-center text-center"><CheckCircle2 className="mb-2 h-7 w-7 text-emerald-500" /><p className="text-xs font-medium text-foreground">No execution risks flagged</p><p className="mt-1 text-[11px] text-muted-foreground">Tasks are currently on track.</p></div> : <div className="divide-y divide-border">{attention.map((task) => <div key={task.id} className="flex items-center gap-3 py-3"><span className={cn("h-2 w-2 rounded-full", task.delay_status === "blocked" ? "bg-red-500" : "bg-amber-500")} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{task.task_name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{taskStatus(task.status)} · {task.delay_status.replace("_", " ")}</p></div><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></div>)}</div>}</section>
      </div>
    </div>
  );
}

function Metric({ title, value, note, tone }: { title: string; value: string; note: string; tone: "violet" | "emerald" | "blue" | "amber" }) {
  const gradient = { violet: "from-violet-500 to-purple-600", emerald: "from-emerald-500 to-teal-600", blue: "from-blue-500 to-indigo-600", amber: "from-amber-500 to-orange-600" }[tone];
  const dot = { violet: "bg-violet-500", emerald: "bg-emerald-500", blue: "bg-blue-500", amber: "bg-amber-500" }[tone];
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", gradient)} />
      <div className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="mt-3 flex items-end justify-between gap-3"><p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p><span className={cn("h-2.5 w-2.5 rounded-full", dot)} /></div>
        <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
      </div>
    </section>
  );
}
function SmallRow({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className={cn("font-semibold", danger && value > 0 ? "text-red-600" : "text-foreground")}>{value}</span></div>; }
function Empty({ text }: { text: string }) { return <p className="py-10 text-center text-xs text-muted-foreground">{text}</p>; }
function ScurveKpi({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "red" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold", color)}>{value}</p>
    </div>
  );
}
