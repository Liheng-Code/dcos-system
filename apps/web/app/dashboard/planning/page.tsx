"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import {
  GanttChartSquare, CalendarRange, GitCompare, Users, BarChart2, Loader2, CalendarDays,
  TrendingUp, Camera, Layers, Briefcase, Target, ClipboardList, Activity,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { captureProgressSnapshot, getProgressSnapshots } from "@/lib/schedule-service";
import { toast } from "sonner";

const SCHEDULE_LEVELS = [
  { href: "/dashboard/planning/gantt?level=1", label: "Level 1 — Executive",    icon: Briefcase,    desc: "Portfolio reporting & oversight",         color: "bg-slate-50 text-slate-700" },
  { href: "/dashboard/planning/gantt?level=2", label: "Level 2 — Master",       icon: Target,       desc: "Phases, milestones & project overview",   color: "bg-indigo-50 text-indigo-600" },
  { href: "/dashboard/planning/gantt?level=3", label: "Level 3 — Control",      icon: GanttChartSquare, desc: "Granular CPM tracking & baselines",     color: "bg-teal-50 text-teal-600" },
  { href: "/dashboard/planning/gantt?level=4", label: "Level 4 — Execution",    icon: ClipboardList,desc: "Work packages & execution planning",      color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/planning/gantt?level=5", label: "Level 5 — Look-ahead",   icon: Activity,     desc: "Daily/weekly tactical planning",         color: "bg-amber-50 text-amber-600" },
];

const MODULES = [
  { href: "/dashboard/planning/gantt",             label: "Gantt Chart",        icon: GanttChartSquare, desc: "Schedule bars, milestones, CPM",    color: "bg-teal-50 text-teal-600" },
  { href: "/dashboard/planning/lookahead",         label: "Look-ahead",         icon: CalendarRange,    desc: "Weekly plans & rolling window",     color: "bg-blue-50 text-blue-600" },
  { href: "/dashboard/planning/scurve",            label: "S-Curve & EVM",      icon: TrendingUp,       desc: "Progress snapshots, planned vs actual", color: "bg-indigo-50 text-indigo-600" },
  { href: "/dashboard/planning/calendars",         label: "Calendars",          icon: CalendarDays,     desc: "Work calendars & holidays",         color: "bg-green-50 text-green-600" },
  { href: "/dashboard/planning/comparison",        label: "Comparison",         icon: GitCompare,       desc: "Baseline vs actual variance",       color: "bg-purple-50 text-purple-600" },
  { href: "/dashboard/planning/resource-loading",  label: "Resource Loading",   icon: Users,            desc: "Resource allocation timeline",      color: "bg-orange-50 text-orange-600" },
  { href: "/dashboard/planning/reports",           label: "Schedule Reports",   icon: BarChart2,        desc: "Delay analysis & milestones",       color: "bg-red-50 text-red-600" },
  { href: "/dashboard/planning/delays",            label: "Delay Register",     icon: BarChart2,        desc: "Delay events & EOT tracking",       color: "bg-rose-50 text-rose-600" },
];

export default function PlanningPage() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [snapshot, setSnapshot] = useState<{ planned_progress: number | null; actual_progress: number | null } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!selectedProjectId) { setCounts({}); setSnapshot(null); setLoading(false); return; }
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
      toast.success("Snapshot captured");
    } catch (e: any) {
      toast.error(e.message);
    }
    setCapturing(false);
  }

  const spi = snapshot?.planned_progress && snapshot.planned_progress > 0
    ? Math.round(((snapshot.actual_progress ?? 0) / snapshot.planned_progress) * 100) / 100
    : null;

  const spiColor = spi === null ? "" : spi >= 1.0 ? "text-green-600" : spi >= 0.9 ? "text-yellow-600" : "text-red-600";

  return (
    <PlanPageShell title="Planning & Scheduling" description="Schedule management, Gantt, CPM, resource loading" icon={GanttChartSquare}>
      <div className="space-y-6">
        {/* Schedule Levels */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Schedule Levels</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {SCHEDULE_LEVELS.map(sl => (
              <Link key={sl.href} href={sl.href}>
                <Card className="transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full">
                  <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sl.color}`}>
                      <sl.icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{sl.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{sl.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Planning Modules */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <GanttChartSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Planning Tools</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(m => (
            <Link key={m.href} href={m.href}>
              <Card className="transition-colors hover:bg-muted/50 cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${m.color}`}>
                    <m.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : counts.tasks ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Total Tasks</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : counts.calendars ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Calendars</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : snapshot ? `${snapshot.planned_progress ?? 0}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">Planned Progress</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : snapshot ? `${snapshot.actual_progress ?? 0}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">Actual Progress</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className={cn("text-2xl font-bold", spiColor)}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : spi !== null ? spi.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">SPI</p>
          </CardContent></Card>
        </div>

        {selectedProjectId && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCaptureSnapshot} disabled={capturing || !selectedProjectId}>
              {capturing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
              Capture Progress Snapshot
            </Button>
          </div>
        )}

        {!selectedProjectId && !projectLoading && (
          <p className="text-sm text-muted-foreground text-center py-4">Select a project from the sidebar to view planning data.</p>
        )}
      </div>
    </PlanPageShell>
  );
}
