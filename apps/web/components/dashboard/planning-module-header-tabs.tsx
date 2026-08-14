"use client";

import { usePathname } from "next/navigation";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActivePlanningGroup } from "@/lib/planning-nav";

// Planning routes span /dashboard/planning and /dashboard/wbs/lookahead, so
// this is rendered by a thin layout in each of those directories (it
// resolves the active group from the current pathname).
export function PlanningModuleHeaderTabs() {
  const pathname = usePathname();
  const activeGroup = getActivePlanningGroup(pathname);
  return <ModuleHeaderTabs activeGroup={activeGroup} />;
}
