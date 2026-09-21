"use client";

import Link from "next/link";
import {
  GanttChartSquare, CalendarRange, GitCompare, Users, BarChart2, CalendarDays,
  TrendingUp, Layers, Briefcase, Target, ClipboardList, Activity, Table2, Zap,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  color: string;
}

const SCHEDULE_LEVELS: QuickAction[] = [
  { href: "/dashboard/planning/gantt?level=1", label: "Level 1 — Executive",  icon: Briefcase,        desc: "Portfolio reporting & oversight",       color: "bg-zinc-500/20 text-zinc-300" },
  { href: "/dashboard/planning/gantt?level=2", label: "Level 2 — Master",     icon: Target,           desc: "Phases, milestones & project overview", color: "bg-indigo-500/15 text-indigo-400" },
  { href: "/dashboard/planning/gantt?level=3", label: "Level 3 — Control",    icon: GanttChartSquare, desc: "Granular CPM tracking & baselines",     color: "bg-teal-500/15 text-teal-400" },
  { href: "/dashboard/planning/gantt?level=4", label: "Level 4 — Execution",  icon: ClipboardList,    desc: "Work packages & execution planning",    color: "bg-blue-500/15 text-blue-400" },
  { href: "/dashboard/planning/gantt?level=5", label: "Level 5 — Look-ahead", icon: Activity,         desc: "Daily/weekly tactical planning",        color: "bg-amber-500/15 text-amber-400" },
];

const PLANNING_TOOLS: QuickAction[] = [
  { href: "/dashboard/planning/gantt",            label: "Gantt Chart",      icon: GanttChartSquare, desc: "Schedule bars, milestones, CPM",        color: "bg-teal-500/15 text-teal-400" },
  { href: "/dashboard/planning/sheet",            label: "Task Sheet",       icon: Table2,           desc: "Editable MS-Project-style grid",        color: "bg-cyan-500/15 text-cyan-400" },
  { href: "/dashboard/planning/lookahead",        label: "Look-ahead",       icon: CalendarRange,    desc: "Weekly plans & rolling window",         color: "bg-blue-500/15 text-blue-400" },
  { href: "/dashboard/planning/scurve",           label: "S-Curve & EVM",    icon: TrendingUp,       desc: "Progress snapshots, planned vs actual", color: "bg-indigo-500/15 text-indigo-400" },
  { href: "/dashboard/planning/calendars",        label: "Calendars",        icon: CalendarDays,     desc: "Work calendars & holidays",             color: "bg-green-500/15 text-green-400" },
  { href: "/dashboard/planning/comparison",       label: "Comparison",       icon: GitCompare,       desc: "Baseline vs actual variance",           color: "bg-purple-500/15 text-purple-400" },
  { href: "/dashboard/planning/resource-loading", label: "Resource Loading", icon: Users,            desc: "Resource allocation timeline",          color: "bg-orange-500/15 text-orange-400" },
  { href: "/dashboard/planning/reports",          label: "Schedule Reports", icon: BarChart2,        desc: "Delay analysis & milestones",           color: "bg-red-500/15 text-red-400" },
  { href: "/dashboard/planning/delays",           label: "Delay Register",   icon: BarChart2,        desc: "Delay events & EOT tracking",           color: "bg-rose-500/15 text-rose-400" },
];

function ActionGroup({
  title, icon: Icon, items, listClass,
}: { title: string; icon: LucideIcon; items: QuickAction[]; listClass: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <ul className={`grid gap-1 ${listClass}`}>
        {items.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${a.color}`}>
                <a.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{a.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{a.desc}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlanningQuickActions() {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ActionGroup title="Schedule Levels" icon={Layers} items={SCHEDULE_LEVELS} listClass="grid-cols-1" />
          <ActionGroup
            title="Planning Tools"
            icon={GanttChartSquare}
            items={PLANNING_TOOLS}
            listClass="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          />
        </div>
      </CardContent>
    </Card>
  );
}
