"use client";

import { usePathname } from "next/navigation";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveReportingGroup } from "@/lib/reporting/reporting-nav";

// Reporting routes span /dashboard/reports and /dashboard/insights, so this
// is rendered by a thin layout in each of those directories (it resolves the
// active group from the current pathname).
export function ReportingModuleHeaderTabs() {
  const pathname = usePathname();
  const activeGroup = getActiveReportingGroup(pathname);
  return <ModuleHeaderTabs activeGroup={activeGroup} />;
}
