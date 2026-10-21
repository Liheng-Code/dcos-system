"use client";

import { Suspense } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityKits } from "@/components/planning/plan-activity-kits";

export default function ActivityKitsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Generation Kits"
        description="Which activity template goes on each part of a building, per project category: Generate builds a whole building in one run"
        icon={Boxes}
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <PlanActivityKits />
      </PlanPageShell>
    </Suspense>
  );
}
