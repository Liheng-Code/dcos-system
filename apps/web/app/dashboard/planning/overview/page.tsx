"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { Network } from "lucide-react";
import { PlanningOverviewInfographic } from "@/components/planning/planning-overview-infographic";
import { PlanProgrammeReadiness } from "@/components/planning/readiness/plan-programme-readiness";
import { PlanAiAssistPanel } from "@/components/planning/plan-ai-assist-panel";

export default function PlanningOverviewPage() {
  return (
    <PlanPageShell
      title="Planning Overview"
      description="The selected project's programme readiness, and how the module fits together"
      icon={Network}
    >
      <div className="space-y-6">
        {/* doc 35 U1: the guided steps as a live checklist (shown when a project is selected) */}
        <PlanProgrammeReadiness />
        {/* doc 35 A4 */}
        <PlanAiAssistPanel
          title="Ask about the programme"
          description="Answered from the programme as calculated at the data date: critical and late work, the next 30 days, milestones, contract milestones and open delays."
          kind="schedule_answer" buttonLabel="Ask" show={4}
          question="e.g. What is driving the finish date? Which critical activities start next month?"
          request={(projectId, question) => ({ tool: "ask_schedule", projectId, question })}
        />
        <PlanningOverviewInfographic />
      </div>
    </PlanPageShell>
  );
}
