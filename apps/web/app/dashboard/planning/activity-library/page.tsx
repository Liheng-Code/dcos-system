"use client";

import { Suspense } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityLibrary } from "@/components/planning/plan-activity-library";

export default function ActivityLibraryPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Activity Library"
        description="Reusable construction activities (WHAT) with methods, productivity, resources and logic"
        icon={BookMarked}
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <PlanActivityLibrary />
      </PlanPageShell>
    </Suspense>
  );
}
