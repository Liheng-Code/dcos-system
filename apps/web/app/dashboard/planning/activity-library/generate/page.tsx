"use client";

import { Suspense } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityGenerate } from "@/components/planning/plan-activity-generate";

export default function ActivityGeneratePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Generate Activities"
        description="Stamp an Activity Template onto project levels: quantities, durations and logic are calculated, exceptions flagged for review"
        icon={Sparkles}
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <PlanActivityGenerate />
      </PlanPageShell>
    </Suspense>
  );
}
