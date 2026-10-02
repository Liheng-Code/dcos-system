"use client";

import { HsePageShell } from "@/components/construction/hse/hse-page-shell";
import { HseToolboxTalks } from "@/components/construction/hse/hse-toolbox-talks";
import { MessageSquare } from "lucide-react";

export default function ToolboxTalksPage() {
  return (
    <HsePageShell title="Toolbox Talks" description="Daily safety briefings" icon={MessageSquare} iconColor="text-green-600" iconBg="bg-green-50">
      <HseToolboxTalks />
    </HsePageShell>
  );
}
