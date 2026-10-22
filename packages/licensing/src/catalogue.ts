// Entitlement catalogue: what a DCOS license can grant. Shared by the tenant app
// (apps/web, which maps entitlements to its routes) and DCOS HQ (apps/hq, which
// sells and signs them). Design: docs/01-DCOS-Foundation/
// DCOS-Licensing-Control-Plane-Design.md sections 3.2 and 7.2.
//
// A module entitlement key equals the module manifest key (module_settings.module_key),
// except that the `construction` manifest is sold as three entitlements: `construction`
// (Site / daily reporting), `hse` and `qaqc`. Module bundles are not decided yet
// (owner decision 4), so plans are just sets of these keys.

export interface ModuleEntitlement {
  key: string;
  label: string;
  // Manifest that holds the code.
  manifestKey: string;
  // Route prefixes inside the manifest when it is split across entitlements.
  pathPrefixes?: string[];
  // Always granted, never licensable.
  alwaysOn?: boolean;
}

export const MODULE_ENTITLEMENTS: ModuleEntitlement[] = [
  { key: "project", label: "Project", manifestKey: "project", alwaysOn: true },
  { key: "administration", label: "Administration", manifestKey: "administration", alwaysOn: true },
  { key: "planning", label: "Planning", manifestKey: "planning" },
  { key: "qs", label: "QS", manifestKey: "qs" },
  { key: "procurement", label: "Procurement", manifestKey: "procurement" },
  { key: "inventory", label: "Inventory", manifestKey: "inventory" },
  { key: "document_control", label: "Document Control", manifestKey: "document_control" },
  {
    key: "construction",
    label: "Site (Daily Reporting)",
    manifestKey: "construction",
    pathPrefixes: ["/dashboard/site", "/api/dr", "/field", "/dr-miniapp"],
  },
  { key: "hse", label: "HSE", manifestKey: "construction", pathPrefixes: ["/dashboard/hse"] },
  { key: "qaqc", label: "QA/QC", manifestKey: "construction", pathPrefixes: ["/dashboard/qaqc"] },
  { key: "account", label: "Finance", manifestKey: "account" },
  { key: "hr", label: "HR", manifestKey: "hr" },
  { key: "design", label: "Design / BIM", manifestKey: "design" },
  { key: "reporting", label: "Reporting", manifestKey: "reporting" },
  // Cost Libraries API (prelim, residential, etc.)
  { key: "libraries", label: "Libraries", manifestKey: "libraries", pathPrefixes: ["/api/libraries"] },
];

export interface FeatureEntitlement {
  key: string;
  label: string;
  // API route prefixes the feature governs (the UI checks useLicense().hasFeature).
  apiPrefixes: string[];
  // Not sellable until it exists (design section 3.2, decision 7).
  available: boolean;
}

export const FEATURE_ENTITLEMENTS: FeatureEntitlement[] = [
  { key: "ai_planning", label: "AI Planning", apiPrefixes: [], available: true },
  { key: "ai_qs", label: "AI QS", apiPrefixes: ["/api/tenders/[id]/ai-boq-draft"], available: true },
  { key: "advanced_reports", label: "Advanced Reports", apiPrefixes: [], available: true },
  { key: "api_access", label: "API Access", apiPrefixes: [], available: false },
];

export const ALWAYS_ON_MODULES = MODULE_ENTITLEMENTS.filter((m) => m.alwaysOn).map((m) => m.key);
export const LICENSABLE_MODULES = MODULE_ENTITLEMENTS.filter((m) => !m.alwaysOn).map((m) => m.key);
export const ALL_FEATURES = FEATURE_ENTITLEMENTS.map((f) => f.key);
export const AVAILABLE_FEATURES = FEATURE_ENTITLEMENTS.filter((f) => f.available).map((f) => f.key);

export function moduleLabel(key: string): string {
  return MODULE_ENTITLEMENTS.find((m) => m.key === key)?.label ?? key;
}

export function featureLabel(key: string): string {
  return FEATURE_ENTITLEMENTS.find((f) => f.key === key)?.label ?? key;
}
