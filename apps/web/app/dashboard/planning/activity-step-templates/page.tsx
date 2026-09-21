"use client";

import { Suspense } from "react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityStepTemplates } from "@/components/planning/plan-activity-step-templates";
import { ListChecks, Loader2 } from "lucide-react";

function ActivityStepTemplatesPageContent() {
  return (
    <PlanPageShell
      title="Activity Step Templates"
      description="Reusable, weighted step breakdowns (e.g. Blockwork, Plastering) — assign to an activity to auto roll up its % Complete"
      icon={ListChecks}
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <PlanActivityStepTemplates />
    </PlanPageShell>
  );
}

export default function ActivityStepTemplatesPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ActivityStepTemplatesPageContent />
    </Suspense>
  );
}
