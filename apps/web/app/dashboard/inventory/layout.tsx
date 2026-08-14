"use client";

import { usePathname } from "next/navigation";
import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveInventoryGroup } from "@/lib/inventory-nav";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ModulePageLayout headerTabs={<ModuleHeaderTabs activeGroup={getActiveInventoryGroup(pathname)} />}>
      {children}
    </ModulePageLayout>
  );
}
