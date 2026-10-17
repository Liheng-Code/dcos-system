"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { BookMarked, Loader2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityDetail } from "@/components/planning/plan-activity-detail";

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="Activity Library"
        description="Activity master detail"
        icon={BookMarked}
        hideHeader
        contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        <PlanActivityDetail id={id} />
      </PlanPageShell>
    </Suspense>
  );
}
