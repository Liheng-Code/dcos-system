"use client";

import { usePathname } from "next/navigation";
import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveAccountGroup } from "@/lib/account-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ModulePageLayout headerTabs={<ModuleHeaderTabs activeGroup={getActiveAccountGroup(pathname)} />}>
      {children}
    </ModulePageLayout>
  );
}
