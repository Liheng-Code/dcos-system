"use client";

import { Suspense } from "react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanGanttChart } from "@/components/planning/plan-gantt-chart";
import { GanttChartSquare, Loader2 } from "lucide-react";

function GanttPageContent() {
  return (
    <PlanPageShell
      title="Gantt Chart"
      description="Schedule view with WBS hierarchy, milestones, CPM, and baseline overlay"
      icon={GanttChartSquare}
      hideHeader
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-0"
    >
      <PlanGanttChart />
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
