"use client";

import { usePathname } from "next/navigation";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveConstructionGroup } from "@/lib/construction-nav";

// Construction routes span /dashboard/site, /dashboard/qaqc and
// /dashboard/hse, so this is rendered by a thin layout in each of those
// directories (it resolves the active group from the current pathname).
export function ConstructionModuleHeaderTabs() {
  const pathname = usePathname();
  const activeGroup = getActiveConstructionGroup(pathname);
  return <ModuleHeaderTabs activeGroup={activeGroup} />;
}
