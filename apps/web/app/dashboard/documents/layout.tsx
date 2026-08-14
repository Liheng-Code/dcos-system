"use client";

import { usePathname } from "next/navigation";
import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveDocumentControlGroup } from "@/lib/document-control-nav";

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ModulePageLayout headerTabs={<ModuleHeaderTabs activeGroup={getActiveDocumentControlGroup(pathname)} />}>
      {children}
    </ModulePageLayout>
  );
}
