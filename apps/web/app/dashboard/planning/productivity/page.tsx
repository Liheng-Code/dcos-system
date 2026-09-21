"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanNormLibrary } from "@/components/planning/plan-norm-library";
import { Gauge } from "lucide-react";

export default function ProductivityNormsPage() {
  return (
    <PlanPageShell
      title="Productivity Norms"
      description="Man-hours per unit of work and the crew that does it — the basis for manpower required"
      icon={Gauge}
      iconColor="text-teal-400"
      iconBg="bg-teal-500/15"
    >
      <PlanNormLibrary />
    </PlanPageShell>
  );
}
