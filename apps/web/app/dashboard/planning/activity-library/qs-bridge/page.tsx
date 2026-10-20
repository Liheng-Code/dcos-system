"use client";

import { Suspense } from "react";
import { GitMerge, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanQsBridge } from "@/components/planning/plan-qs-bridge";

export default function ActivityQsBridgePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="QS Bridge"
        description="Which QS elements feed which activity quantity, and how much of the project BOQ can drive durations"
        icon={GitMerge}
        contentClassName="flex-1 overflow-y-auto p-0"
      >
        <PlanQsBridge />
      </PlanPageShell>
    </Suspense>
  );
}
