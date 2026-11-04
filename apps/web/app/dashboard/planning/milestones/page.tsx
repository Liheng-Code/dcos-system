"use client";

import { Flag } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanContractMilestones } from "@/components/planning/milestones/plan-contract-milestones";

export default function PlanContractMilestonesPage() {
  return (
    <PlanPageShell
      title="Contract Milestones"
      description="The dates the contract fixes, their extensions, and where the programme forecasts each one, with damages exposure"
      icon={Flag}
    >
      <PlanContractMilestones />
    </PlanPageShell>
  );
}
