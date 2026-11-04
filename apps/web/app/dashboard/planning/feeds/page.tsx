"use client";

import { Share2 } from "lucide-react";
import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanOutboundFeeds } from "@/components/planning/feeds/plan-outbound-feeds";

export default function PlanOutboundFeedsPage() {
  return (
    <PlanPageShell
      title="Outbound Feeds"
      description="What the programme asks of Procurement, HR, QA/QC, Document Control and Finance, published as numbered versions they read"
      icon={Share2}
    >
      <PlanOutboundFeeds />
    </PlanPageShell>
  );
}
