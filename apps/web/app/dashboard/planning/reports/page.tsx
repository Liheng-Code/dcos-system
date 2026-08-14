"use client";

import { Suspense } from "react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanScheduleReports } from "@/components/planning/plan-schedule-reports";
import { BarChart2, Loader2 } from "lucide-react";

export default function ReportsPage() {
  return (
    <PlanPageShell title="Schedule Reports" description="Delay analysis, milestone tracking, status summary" icon={BarChart2} iconColor="text-red-600" iconBg="bg-red-50">
      <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <PlanScheduleReports />
      </Suspense>
    </PlanPageShell>
  );
}
