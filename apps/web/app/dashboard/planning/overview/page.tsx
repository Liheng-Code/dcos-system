"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { Network } from "lucide-react";
import { PlanningOverviewInfographic } from "@/components/planning/planning-overview-infographic";

export default function PlanningOverviewPage() {
  return (
    <PlanPageShell
      title="Planning Overview"
      description="How the module fits together — every capability, and how it connects to the others"
      icon={Network}
    >
      <PlanningOverviewInfographic />
    </PlanPageShell>
  );
}
