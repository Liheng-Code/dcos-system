"use client";

import { ClipboardCheck } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanScheduleCheck } from "@/components/planning/plan-schedule-check";

export default function PlanScheduleCheckPage() {
  return (
    <PlanPageShell
      title="Schedule Check"
      description="DCMA 14-point quality checks on the programme, with findings that stay until resolved or accepted"
      icon={ClipboardCheck}
    >
      <PlanScheduleCheck />
    </PlanPageShell>
  );
}
