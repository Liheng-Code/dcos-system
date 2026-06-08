"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanComparisonDashboard } from "@/components/planning/plan-comparison-dashboard";
import { GitCompare } from "lucide-react";

export default function ComparisonPage() {
  return (
    <PlanPageShell title="Schedule Comparison" description="Baseline vs planned variance analysis" icon={GitCompare} iconColor="text-purple-600" iconBg="bg-purple-50">
      <PlanComparisonDashboard />
    </PlanPageShell>
  );
}
