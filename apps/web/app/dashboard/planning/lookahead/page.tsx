"use client";

import { WbsLookaheadView } from "@/components/project/wbs/wbs-lookahead-view";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { Suspense } from "react";
import { CalendarRange, Loader2 } from "lucide-react";

export default function PlanLookaheadPage() {
  return (
    <PlanPageShell title="Look-ahead" description="Rolling lookahead window for active tasks" icon={CalendarRange}>
      {/* The view keeps its filters in the URL (useSearchParams), which needs a Suspense boundary. */}
      <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        <WbsLookaheadView />
      </Suspense>
    </PlanPageShell>
  );
}
