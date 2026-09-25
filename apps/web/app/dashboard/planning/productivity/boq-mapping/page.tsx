"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanBoqMapping } from "@/components/planning/plan-boq-mapping";
import { Link2 } from "lucide-react";

export default function BoqMappingPage() {
  return (
    <PlanPageShell
      title="BOQ Mapping"
      description="Suggests which BOQ lines belong to which tasks — every link is a manual confirm, never applied silently"
      icon={Link2}
      iconColor="text-teal-400"
      iconBg="bg-teal-500/15"
    >
      <PlanBoqMapping />
    </PlanPageShell>
  );
}
