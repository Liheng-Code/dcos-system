"use client";

import { Suspense } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanAiAssistant } from "@/components/planning/plan-ai-assistant";

export default function ActivityAiPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PlanPageShell
        title="AI Assistant"
        description="Advisory suggestions for the Activity Library: switch, monthly budget, usage and decisions"
        icon={Sparkles}
        contentClassName="flex-1 overflow-y-auto p-0"
      >
        <PlanAiAssistant />
      </PlanPageShell>
    </Suspense>
  );
}
