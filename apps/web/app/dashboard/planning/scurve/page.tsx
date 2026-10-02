"use client";

import { WbsScurveChart } from "@/components/project/wbs/wbs-scurve-chart";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { TrendingUp } from "lucide-react";

export default function PlanScurvePage() {
  return (
    <PlanPageShell title="S-Curve & EVM" description="Progress snapshots, planned vs actual, earned value" icon={TrendingUp}>
      <WbsScurveChart />
    </PlanPageShell>
  );
}
