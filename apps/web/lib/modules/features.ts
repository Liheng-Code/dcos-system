// Features: the independently releasable units inside a module. Every nav group
// and every page under it (and every leaf link of Project / Administration) is a
// feature, identified by the same nav_key used in public.nav_item_settings.
//
// Whether a feature is on is decided per environment:
//   - a nav_item_settings row, when one exists, wins (the admin toggle);
//   - with no row, a "released" feature is on and a "development" feature is off.
// So unfinished work can be merged and deployed as "development" and stays hidden
// and unreachable until it is switched on in that environment's database.

import type { FeatureStatus, ModuleNavTabItem } from "@/lib/module-nav";
import { MODULE_REGISTRY, getModuleForPath } from "@/lib/modules/registry";

export interface ModuleFeature {
  // nav_item_settings.nav_key: the href for a page, "group:<module>:<slug>" for a group.
  navKey: string;
  moduleKey: string;
  label: string;
  nodeType: "group" | "item";
  parentGroupKey?: string;
  status: FeatureStatus;
  // Route the feature owns. Null for groups and for "?tab=" views of a shared
  // page, which can be hidden but not route-blocked.
  path: string | null;
  // Claims its route but is not a tab (reached from another page), so it has no toggle.
  hiddenTab?: boolean;
}

// Minimal shape of a public.nav_item_settings row needed to resolve a feature.
export interface FeatureSetting {
  nav_key: string;
  is_active: boolean;
}

// Local/preview override: show "development" features that have no settings row.
// Never set this in production.
const SHOW_DEVELOPMENT_FEATURES = process.env.NEXT_PUBLIC_DCOS_SHOW_DEV_FEATURES === "true";

// The landing page every blocked route redirects to; it is never blocked itself.
const LANDING_PATH = "/dashboard";

function itemPath(href: string): string | null {
  return href.includes("?") ? null : href;
}

function buildFeatures(): ModuleFeature[] {
  const features: ModuleFeature[] = [];
  for (const manifest of MODULE_REGISTRY) {
    for (const leaf of manifest.navItems ?? []) {
      features.push({
        navKey: leaf.href,
        moduleKey: manifest.key,
        label: leaf.label,
        nodeType: "item",
        status: leaf.status ?? "released",
        path: itemPath(leaf.href),
      });
    }
    for (const group of manifest.navGroups ?? []) {
      features.push({
        navKey: group.navKey,
        moduleKey: manifest.key,
        label: group.label,
        nodeType: "group",
        status: group.status ?? "released",
        path: null,
      });
      for (const item of group.items as ModuleNavTabItem[]) {
        features.push({
          navKey: item.href,
          moduleKey: manifest.key,
          label: item.label,
          nodeType: "item",
          parentGroupKey: group.navKey,
          status: item.status ?? "released",
          path: itemPath(item.href),
          hiddenTab: item.hidden,
        });
      }
    }
  }
  return features;
}

export const MODULE_FEATURES: ModuleFeature[] = buildFeatures();

const FEATURES_BY_NAV_KEY = new Map<string, ModuleFeature[]>();
for (const feature of MODULE_FEATURES) {
  const list = FEATURES_BY_NAV_KEY.get(feature.navKey) ?? [];
  list.push(feature);
  FEATURES_BY_NAV_KEY.set(feature.navKey, list);
}

// Paths that have other feature paths nested beneath them (e.g. a module's
// dashboard page). Such a feature only owns its exact path, not everything below.
const ROUTED_FEATURES = MODULE_FEATURES.filter((f) => f.path !== null);
const CONTAINER_PATHS = new Set(
  ROUTED_FEATURES.filter((f) =>
    ROUTED_FEATURES.some((other) => other.path!.startsWith(f.path + "/")),
  ).map((f) => f.path!),
);

export function getFeatureStatus(navKey: string): FeatureStatus {
  const features = FEATURES_BY_NAV_KEY.get(navKey);
  if (!features) return "released";
  // A page listed under two modules (e.g. a report shortcut) shares one nav_key;
  // it counts as released if any listing is.
  return features.some((f) => f.status === "released") ? "released" : "development";
}

export function isFeatureActive(
  navKey: string,
  settings: FeatureSetting[],
  showDevelopment: boolean = SHOW_DEVELOPMENT_FEATURES,
): boolean {
  const row = settings.find((s) => s.nav_key === navKey);
  if (row) return row.is_active;
  return getFeatureStatus(navKey) === "released" || showDevelopment;
}

// The feature that owns pathname: the longest feature path that equals it or,
// for a non-container feature, is a parent of it.
export function getFeatureForPath(pathname: string): ModuleFeature | undefined {
  if (pathname === LANDING_PATH) return undefined;
  let best: ModuleFeature | undefined;
  for (const feature of ROUTED_FEATURES) {
    const path = feature.path!;
    const exact = pathname === path;
    const nested = pathname.startsWith(path + "/") && !CONTAINER_PATHS.has(path);
    if (!exact && !nested) continue;
    const better =
      !best ||
      path.length > best.path!.length ||
      // Same path listed under two modules: prefer the module that owns the route.
      (path.length === best.path!.length && getModuleForPath(path)?.key === feature.moduleKey);
    if (better) best = feature;
  }
  return best;
}

// True when pathname belongs to a feature (or a group) that is off.
export function isFeatureRouteBlocked(
  pathname: string,
  settings: FeatureSetting[],
  showDevelopment: boolean = SHOW_DEVELOPMENT_FEATURES,
): boolean {
  const feature = getFeatureForPath(pathname);
  if (!feature) return false;
  if (!isFeatureActive(feature.navKey, settings, showDevelopment)) return true;
  return !!feature.parentGroupKey && !isFeatureActive(feature.parentGroupKey, settings, showDevelopment);
}
