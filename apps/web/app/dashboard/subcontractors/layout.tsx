"use client";

import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { QsModuleHeaderTabs } from "@/components/dashboard/qs-module-header-tabs";

export default function SubcontractorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModulePageLayout headerTabs={<QsModuleHeaderTabs />}>
      {children}
    </ModulePageLayout>
  );
}
