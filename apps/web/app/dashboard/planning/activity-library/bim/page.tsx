"use client";

import { Suspense } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityBim } from "@/components/planning/plan-activity-bim";

export default function ActivityBimPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="BIM Quantities"
        description="How much of the BIM extract Planning can use, and which BIM storey is which WBS level"
        icon={Boxes}
        contentClassName="flex-1 overflow-y-auto p-0"
      >
        <PlanActivityBim />
      </PlanPageShell>
    </Suspense>
  );
}
