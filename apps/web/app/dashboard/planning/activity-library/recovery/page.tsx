"use client";

import { Suspense } from "react";
import { Loader2, Zap } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityRecovery } from "@/components/planning/plan-activity-recovery";

export default function ActivityRecoveryPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Recovery Scenarios"
        description="Compare ways to bring the forecast finish back to a target: crews, method changes, expediting, overlapping"
        icon={Zap}
        contentClassName="flex-1 overflow-y-auto p-0"
      >
        <PlanActivityRecovery />
      </PlanPageShell>
    </Suspense>
  );
}
