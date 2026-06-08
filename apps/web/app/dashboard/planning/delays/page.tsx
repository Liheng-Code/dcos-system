"use client";

import { PlanDelayRegister } from "@/components/planning/plan-delay-register";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { AlertTriangle } from "lucide-react";

export default function PlanDelaysPage() {
  return (
    <PlanPageShell title="Delay Register" description="Log and track project delay events for EOT analysis" icon={AlertTriangle}>
      <PlanDelayRegister />
    </PlanPageShell>
  );
}
