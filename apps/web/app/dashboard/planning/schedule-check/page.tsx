"use client";

import { ClipboardCheck } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanScheduleCheck } from "@/components/planning/plan-schedule-check";
import { PlanAiAssistPanel } from "@/components/planning/plan-ai-assist-panel";

export default function PlanScheduleCheckPage() {
  return (
    <PlanPageShell
      title="Schedule Check"
      description="DCMA 14-point quality checks on the programme, with findings that stay until resolved or accepted"
      icon={ClipboardCheck}
    >
      <div className="space-y-6">
        <PlanScheduleCheck />
        {/* doc 35 A1 */}
        <PlanAiAssistPanel
          title="Explain the findings"
          description="Plain-language explanation of each open finding, why it matters for this programme, what to check first, and the order to fix them in."
          kind="qaqc_explanation" buttonLabel="Explain with AI" show={14}
          request={(projectId) => ({ tool: "explain_qaqc_findings", projectId })}
        />
      </div>
    </PlanPageShell>
  );
}
