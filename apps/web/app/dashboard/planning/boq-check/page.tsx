"use client";

import { Scale } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanBoqMappingCheck } from "@/components/planning/boq-mapping/plan-boq-mapping-check";

export default function PlanBoqMappingCheckPage() {
  return (
    <PlanPageShell
      title="BOQ Mapping Check"
      description="Mapped against BOQ quantity per line, lines counted twice, BOQ changes waiting for a decision, and the mapping history"
      icon={Scale}
    >
      <PlanBoqMappingCheck />
    </PlanPageShell>
  );
}
