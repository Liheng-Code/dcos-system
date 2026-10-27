"use client";

import { WbsScurveChart } from "@/components/project/wbs/wbs-scurve-chart";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { CostLoadingCard } from "@/components/planning/boq-programme/loading-charts";
import { useProject } from "@/components/dashboard/project-context";
import { TrendingUp } from "lucide-react";

export default function PlanScurvePage() {
  const { selectedProjectId } = useProject();
  return (
    <PlanPageShell title="S-Curve & EVM" description="Progress snapshots, planned vs actual, earned value" icon={TrendingUp}>
      <div className="flex flex-col gap-6">
        <WbsScurveChart />
        <CostLoadingCard projectId={selectedProjectId} />
      </div>
    </PlanPageShell>
  );
}
