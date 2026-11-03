"use client";

import { Wallet } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { useProject } from "@/components/dashboard/project-context";
import { BudgetReconciliationCard } from "@/components/planning/cost-plan/budget-reconciliation-card";
import { CostByActivityTable, CostComponentsCard } from "@/components/planning/cost-plan/cost-components-card";
import { CashFlowCard } from "@/components/planning/cost-plan/cash-flow-card";

export default function PlanCostPage() {
  const { selectedProjectId } = useProject();
  const projectId = selectedProjectId || null;
  return (
    <PlanPageShell
      title="Cost & Cash Flow"
      description="The programme's budget against the QS approved budget, cost by component, and the planned cash flow"
      icon={Wallet}
    >
      <div className="flex flex-col gap-6">
        <BudgetReconciliationCard projectId={projectId} />
        <CostComponentsCard projectId={projectId} />
        <CashFlowCard projectId={projectId} />
        <CostByActivityTable projectId={projectId} />
      </div>
    </PlanPageShell>
  );
}
