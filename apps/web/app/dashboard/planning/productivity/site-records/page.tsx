"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanSiteRecords } from "@/components/planning/plan-site-records";
import { ClipboardList } from "lucide-react";

export default function SiteRecordsPage() {
  return (
    <PlanPageShell
      title="Site Records"
      description="Daily headcount, hours and quantity done per task or trade, and the resulting productivity index"
      icon={ClipboardList}
      iconColor="text-sky-400"
      iconBg="bg-sky-500/15"
    >
      <PlanSiteRecords />
    </PlanPageShell>
  );
}
