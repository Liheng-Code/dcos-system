"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlanDelayRegister } from "@/components/planning/plan-delay-register";
import { PlanAiAssistPanel } from "@/components/planning/plan-ai-assist-panel";
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
      {tab === "register" && (
        <div className="space-y-6">
          <PlanDelayRegister />
          {/* doc 35 A2 */}
          <PlanAiAssistPanel
            title="Delay summary"
            description="Where the time is going, who is responsible, what is still open and what to watch, worded from the register and its totals."
            kind="delay_summary" buttonLabel="Summarise with AI" show={3}
            request={(projectId) => ({ tool: "summarise_delays", projectId })}
          />
        </div>
      )}
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
