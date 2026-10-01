// Catalog of every nav item (sub-group headings and the pages under them) that
// admins can individually switch on or off, in addition to the whole-module
// toggle. Read by the "Manage navigation items" dialog (see
// components/settings/module-settings-page.tsx).
//
// Derived from the module manifests (lib/modules/features.ts), so it cannot
// drift from the real navigation. navKey rules:
//   - pages: the href of the link (including any "?tab=" query string)
//   - sub-group headings: the synthetic "group:<module_key>:<slug>" key
//
// Keyed by module_key, matching module_settings.module_key exactly.

import type { FeatureStatus } from "@/lib/module-nav";
import { MODULE_FEATURES } from "@/lib/modules/features";

export interface NavCatalogEntry {
  navKey: string;
  label: string;
  nodeType: "group" | "item";
  parentGroupKey?: string; // set for items nested under one of the group headings
  status: FeatureStatus;
}

export const NAV_ITEM_CATALOG: Record<string, NavCatalogEntry[]> = {};

for (const feature of MODULE_FEATURES) {
  // Pages that claim a route but are not shown as a tab have nothing to toggle.
  if (feature.hiddenTab) continue;
  (NAV_ITEM_CATALOG[feature.moduleKey] ??= []).push({
    navKey: feature.navKey,
    label: feature.label,
    nodeType: feature.nodeType,
    parentGroupKey: feature.parentGroupKey,
    status: feature.status,
  });
}
