"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanSheet } from "@/components/planning/plan-sheet";
import { Table2 } from "lucide-react";

export default function SheetPage() {
  return (
    <PlanPageShell
      title="Sheet"
      description="Editable task grid — enter and organise activities like a spreadsheet"
      icon={Table2}
      iconBg="bg-cyan-50"
      iconColor="text-cyan-600"
      headerClassName="shrink-0 border-b border-border px-6 py-2.5"
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-2"
    >
      <PlanSheet />
    </PlanPageShell>
  );
}
