"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityRun } from "@/components/planning/plan-activity-run";
import { useProject } from "@/components/dashboard/project-context";

export default function ActivityRunPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedProjectId } = useProject();
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Generation Run"
        description="Planner review of generated activities"
        icon={Sparkles}
        hideHeader
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        {selectedProjectId ? <PlanActivityRun runId={id} projectId={selectedProjectId} /> : <div className="p-6 text-sm text-muted-foreground">Select the project this run belongs to.</div>}
      </PlanPageShell>
    </Suspense>
  );
}
