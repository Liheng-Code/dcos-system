"use client";

import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { QsModuleHeaderTabs } from "@/components/dashboard/qs-module-header-tabs";

export default function TendersLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModulePageLayout headerTabs={<QsModuleHeaderTabs />}>
      {children}
    </ModulePageLayout>
  );
}
