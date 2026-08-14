"use client";

import { Suspense } from "react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { SyncDashboard } from "@/components/planning/sync/sync-dashboard";
import { ArrowRightLeft, Loader2 } from "lucide-react";

function SyncPageContent() {
  return (
    <PlanPageShell
      title="MS Project Sync"
      description="Two-way schedule exchange with Microsoft Project via MSPDI XML (import → review → commit → export)"
      icon={ArrowRightLeft}
    >
      <SyncDashboard />
    </PlanPageShell>
  );
}

export default function SyncPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <SyncPageContent />
    </Suspense>
  );
}
