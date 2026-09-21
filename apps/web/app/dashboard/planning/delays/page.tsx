"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlanDelayRegister } from "@/components/planning/plan-delay-register";
import { PlanTiaAnalysis } from "@/components/planning/plan-tia-analysis";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SUB_TAB_IDS = ["register", "tia"] as const;
type SubTab = (typeof SUB_TAB_IDS)[number];

function PlanDelaysPageContent() {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as SubTab | null;
  const tab: SubTab = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "register";

  return (
    <PlanPageShell title="Delay Register" description="Log delay events, raise EOT notices, and run Time Impact Analysis" icon={AlertTriangle}>
      <div className="mb-4 flex items-center gap-2">
        {([
          { id: "register" as const, label: "Register" },
          { id: "tia" as const, label: "Time Impact Analysis" },
        ]).map((t) => (
          <a
            key={t.id}
            href={`/dashboard/planning/delays?sub=${t.id}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-slate-900 text-white" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </a>
        ))}
      </div>
      {tab === "register" && <PlanDelayRegister />}
      {tab === "tia" && <PlanTiaAnalysis />}
    </PlanPageShell>
  );
}

export default function PlanDelaysPage() {
  return (
    <Suspense fallback={null}>
      <PlanDelaysPageContent />
    </Suspense>
  );
}
