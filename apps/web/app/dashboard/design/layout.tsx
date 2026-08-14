"use client";

import { usePathname } from "next/navigation";
import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveDesignGroup } from "@/lib/design-nav";

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ModulePageLayout headerTabs={<ModuleHeaderTabs activeGroup={getActiveDesignGroup(pathname)} />}>
      {children}
    </ModulePageLayout>
  );
}
