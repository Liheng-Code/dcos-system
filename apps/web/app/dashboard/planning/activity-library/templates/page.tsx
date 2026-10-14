"use client";

import { Suspense } from "react";
import { LayoutTemplate, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityTemplates } from "@/components/planning/plan-activity-templates";

export default function ActivityTemplatesPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Activity Templates"
        description="Construction recipes: ordered activities with standard logic, applied to project levels"
        icon={LayoutTemplate}
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <PlanActivityTemplates />
      </PlanPageShell>
    </Suspense>
  );
}
