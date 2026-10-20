"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanActivityStepTemplates } from "@/components/planning/plan-activity-step-templates";
import { PlanApplyStepTemplates } from "@/components/planning/plan-apply-step-templates";
import { cn } from "@/lib/utils";
import { ListChecks, Loader2 } from "lucide-react";

const TABS = [
  { key: "library", label: "Template Library" },
  { key: "apply", label: "Apply to Activities" },
] as const;

function ActivityStepTemplatesPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") === "apply" ? "apply" : "library";

  return (
    <PlanPageShell
      title="Activity Step Templates"
      description="Reusable, weighted step breakdowns (e.g. Blockwork, Plastering). Apply them to a project's activities to roll up % Complete and spread each activity's duration over its steps"
      icon={ListChecks}
      contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex items-center gap-1 border-b border-border bg-card px-4 pt-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => router.replace(t.key === "library" ? pathname : `${pathname}?tab=${t.key}`)}
            className={cn(
              "-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "apply" ? <PlanApplyStepTemplates /> : <PlanActivityStepTemplates />}
    </PlanPageShell>
  );
}

export default function ActivityStepTemplatesPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ActivityStepTemplatesPageContent />
    </Suspense>
  );
}
