"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanTaskWork } from "@/components/planning/plan-task-work";
import { Calculator } from "lucide-react";

export default function TaskWorkPage() {
  return (
    <PlanPageShell
      title="Task Work"
      description="Quantity and productivity norm per task → man-hours, crew required and duration"
      icon={Calculator}
      iconColor="text-teal-400"
      iconBg="bg-teal-500/15"
    >
      <PlanTaskWork />
    </PlanPageShell>
  );
}
