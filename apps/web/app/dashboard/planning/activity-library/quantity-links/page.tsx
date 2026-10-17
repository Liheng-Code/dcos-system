"use client";

import { Suspense } from "react";
import { Link2, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityQuantityLinks } from "@/components/planning/plan-activity-quantity-links";

export default function ActivityQuantityLinksPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Quantity Links"
        description="BOQ lines confirmed as the source of activity quantities, and whether the BOQ has changed since"
        icon={Link2}
        contentClassName="flex-1 overflow-y-auto p-0"
      >
        <PlanActivityQuantityLinks />
      </PlanPageShell>
    </Suspense>
  );
}
