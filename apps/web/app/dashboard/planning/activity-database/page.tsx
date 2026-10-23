"use client";

import { Suspense } from "react";
import { Database, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { ActivityDatabaseView } from "@/components/planning/activity-database/activity-database-view";

export default function ActivityDatabasePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Activity Database"
        description="Manage master activities, BOQ links, resources and logic in one place"
        icon={Database}
      >
        <ActivityDatabaseView />
      </PlanPageShell>
    </Suspense>
  );
}
