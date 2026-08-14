"use client";

import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ReportingModuleHeaderTabs } from "@/components/dashboard/reporting-module-header-tabs";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModulePageLayout headerTabs={<ReportingModuleHeaderTabs />}>
      {children}
    </ModulePageLayout>
  );
}
