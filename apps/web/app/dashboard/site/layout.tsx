"use client";

import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ConstructionModuleHeaderTabs } from "@/components/dashboard/construction-module-header-tabs";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModulePageLayout headerTabs={<ConstructionModuleHeaderTabs />}>
      {children}
    </ModulePageLayout>
  );
}
