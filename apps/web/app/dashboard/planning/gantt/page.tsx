"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanGanttChart } from "@/components/planning/plan-gantt-chart";
import { GanttChartSquare, Loader2 } from "lucide-react";
import type { ScheduleLevel } from "@/components/planning/gantt-types";

function GanttPageContent() {
  const searchParams = useSearchParams();
  const levelParam = searchParams.get("level");
  const initialLevel = levelParam ? (Number(levelParam) as ScheduleLevel) : undefined;

  const levelLabels: Record<number, string> = {
    1: "Executive",
    2: "Master",
    3: "Control",
    4: "Execution",
    5: "Look-ahead",
  };

  const levelDesc: Record<number, string> = {
    1: "Portfolio reporting and high-level oversight",
    2: "Complete project overview with phases and milestones",
    3: "Granular project control and tracking with CPM",
    4: "Comprehensive execution planning",
    5: "Daily and weekly tactical planning",
  };

  const title = initialLevel
    ? `Gantt Chart — Level ${initialLevel}: ${levelLabels[initialLevel]}`
    : "Gantt Chart";

  const description = initialLevel
    ? levelDesc[initialLevel]
    : "Schedule view with milestones, CPM, and baseline overlay";

  return (
    <PlanPageShell title={title} description={description} icon={GanttChartSquare}>
      <PlanGanttChart initialLevel={initialLevel} />
    </PlanPageShell>
  );
}

export default function GanttPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <GanttPageContent />
    </Suspense>
  );
}
