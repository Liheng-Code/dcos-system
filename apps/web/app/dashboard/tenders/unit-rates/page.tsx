"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { UnitRatesTab } from "@/components/tenders/cost-estimation/unit-rates-tab";

export default function UnitRatesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Unit Rate Library</h1>
          <p className="text-sm text-muted-foreground">Reusable unit rates by category and trade — shared across all tenders</p>
        </div>
        <UnitRatesTab />
      </div>
    </Suspense>
  );
}
