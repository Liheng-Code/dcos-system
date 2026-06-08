"use client";

import { PlanPageShell } from "@/components/planning/plan-page-shell";
import { PlanResourceLoading } from "@/components/planning/plan-resource-loading";
import { Users } from "lucide-react";

export default function ResourceLoadingPage() {
  return (
    <PlanPageShell title="Resource Loading" description="Task allocation by resource over time" icon={Users} iconColor="text-orange-600" iconBg="bg-orange-50">
      <PlanResourceLoading />
    </PlanPageShell>
  );
}
