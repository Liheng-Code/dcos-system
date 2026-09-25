"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanCostRollup } from "@/components/planning/plan-cost-rollup";
import { DollarSign } from "lucide-react";

export default function CostRollupPage() {
  return (
    <PlanPageShell
      title="Cost Rollup"
      description="Planned resource cost by WBS node, BOQ variance, and the cost-loaded S-curve / cash flow"
      icon={DollarSign}
      iconColor="text-teal-400"
      iconBg="bg-teal-500/15"
    >
      <PlanCostRollup />
    </PlanPageShell>
  );
}
