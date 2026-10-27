"use client";

import { WbsScurveChart } from "@/components/project/wbs/wbs-scurve-chart";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { CostLoadingCard } from "@/components/planning/boq-programme/loading-charts";
import { ProjectScurveCard } from "@/components/project/scurve/project-scurve-card";
import { useProject } from "@/components/dashboard/project-context";
import { TrendingUp } from "lucide-react";

export default function PlanScurvePage() {
  const { selectedProjectId } = useProject();
  return (
    <PlanPageShell title="S-Curve & EVM" description="Cost-loaded baseline vs earned, actual and certified; cost loading; baseline comparison" icon={TrendingUp}>
      <div className="flex flex-col gap-6">
        <ProjectScurveCard projectId={selectedProjectId || null} />
        <CostLoadingCard projectId={selectedProjectId} />
        <WbsScurveChart title="Compare baselines" />
      </div>
    </PlanPageShell>
  );
}
