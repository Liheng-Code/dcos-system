"use client";

import { WbsLookaheadView } from "@/components/project/wbs/wbs-lookahead-view";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { CalendarRange } from "lucide-react";

export default function PlanLookaheadPage() {
  return (
    <PlanPageShell title="Look-ahead" description="Rolling lookahead window for active tasks" icon={CalendarRange}>
      <WbsLookaheadView />
    </PlanPageShell>
  );
}
