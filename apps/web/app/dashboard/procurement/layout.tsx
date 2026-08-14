"use client";

import { usePathname } from "next/navigation";
import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveProcurementGroup } from "@/lib/procurement-nav";

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ModulePageLayout headerTabs={<ModuleHeaderTabs activeGroup={getActiveProcurementGroup(pathname)} />}>
      {children}
    </ModulePageLayout>
  );
}
