"use client";

import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { PlanningModuleHeaderTabs } from "@/components/dashboard/planning-module-header-tabs";

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModulePageLayout headerTabs={<PlanningModuleHeaderTabs />}>
      {children}
    </ModulePageLayout>
  );
}
