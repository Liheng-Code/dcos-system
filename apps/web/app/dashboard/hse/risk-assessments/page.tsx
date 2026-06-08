"use client";

import { HsePageShell } from "@/components/hse/hse-page-shell";
import { HseRiskAssessments } from "@/components/hse/hse-risk-assessments";
import { ClipboardList } from "lucide-react";

export default function RiskAssessmentsPage() {
  return (
    <HsePageShell title="Risk Assessments" description="HIRA, JSA, and risk registers" icon={ClipboardList} iconColor="text-orange-600" iconBg="bg-orange-50">
      <HseRiskAssessments />
    </HsePageShell>
  );
}
