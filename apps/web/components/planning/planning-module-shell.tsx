"use client";

import { ModulePageLayout } from "@/components/dashboard/module-page-layout";
import { PlanningModuleHeaderTabs } from "@/components/dashboard/planning-module-header-tabs";
import { PlanningPermissionsProvider } from "@/contexts/planning-permissions-context";

/**
 * Shared by both `app/dashboard/planning/layout.tsx` and
 * `app/dashboard/wbs/lookahead/layout.tsx` (two different route trees that
 * both render Planning pages) so `PlanningPermissionsProvider` is mounted in
 * exactly one place. Since a layout persists across its own in-module page
 * navigation (unlike `page.tsx`, which fully remounts), permissions now load
 * once per session-in-Planning instead of once per page click.
 */
export function PlanningModuleShell({ children }: { children: React.ReactNode }) {
  return (
    <PlanningPermissionsProvider>
      <ModulePageLayout headerTabs={<PlanningModuleHeaderTabs />}>
        {children}
      </ModulePageLayout>
    </PlanningPermissionsProvider>
  );
}
