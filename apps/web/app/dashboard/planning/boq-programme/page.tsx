"use client";

import { Suspense } from "react";
import { ListChecks, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { BoqProgrammeView } from "@/components/planning/boq-programme/boq-programme-view";

export default function BoqProgrammePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Generate from BOQ"
        description="How ready the BOQ is to drive a programme, and what still blocks it"
        icon={ListChecks}
      >
        <BoqProgrammeView />
      </PlanPageShell>
    </Suspense>
  );
}
