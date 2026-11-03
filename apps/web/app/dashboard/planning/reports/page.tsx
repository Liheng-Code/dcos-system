"use client";

import { Suspense } from "react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanScheduleReports } from "@/components/planning/plan-schedule-reports";
import { BoqManpowerHistogramCard, CostLoadingCard } from "@/components/planning/boq-programme/loading-charts";
import { useProject } from "@/components/dashboard/project-context";
import { ReportBasisStrip } from "@/components/planning/reports/report-basis-strip";
import { PlanReportDocuments } from "@/components/planning/reports/plan-report-documents";
import { BarChart2, Loader2 } from "lucide-react";

export default function ReportsPage() {
  const { selectedProjectId } = useProject();
  return (
    <PlanPageShell title="Schedule Reports" description="Report documents (master programme, weekly, monthly, recovery), delay analysis, milestones, status summary" icon={BarChart2} iconColor="text-red-600" iconBg="bg-red-50">
      <ReportBasisStrip projectId={selectedProjectId || null} className="mb-4" />
      <div className="mb-6"><PlanReportDocuments /></div>
      <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
        <PlanScheduleReports />
      </Suspense>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <CostLoadingCard projectId={selectedProjectId} />
        <BoqManpowerHistogramCard projectId={selectedProjectId} defaultPeriod="month" />
      </div>
    </PlanPageShell>
  );
}
