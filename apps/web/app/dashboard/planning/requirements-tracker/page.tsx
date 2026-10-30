"use client";

import { Suspense } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { RequirementsTrackerView } from "@/components/planning/activity-database/requirements-tracker-view";

export default function RequirementsTrackerPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Requirements Tracker"
        description="Shop drawings, method statements, T&C and coordination the project's activities need, against the records that fulfil them"
        icon={ClipboardCheck}
      >
        <RequirementsTrackerView />
      </PlanPageShell>
    </Suspense>
  );
}
