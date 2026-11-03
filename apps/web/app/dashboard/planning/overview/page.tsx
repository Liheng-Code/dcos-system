"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { Network } from "lucide-react";
import { PlanningOverviewInfographic } from "@/components/planning/planning-overview-infographic";
import { PlanProgrammeReadiness } from "@/components/planning/readiness/plan-programme-readiness";

export default function PlanningOverviewPage() {
  return (
    <PlanPageShell
      title="Planning Overview"
      description="The selected project's programme readiness, and how the module fits together"
      icon={Network}
    >
      <div className="space-y-6">
        {/* doc 35 U1: the guided steps as a live checklist (shown when a project is selected) */}
        <PlanProgrammeReadiness />
        <PlanningOverviewInfographic />
      </div>
    </PlanPageShell>
  );
}
