import { createClient } from "@/lib/supabase/client";
import { getModuleForPath } from "@/lib/modules/registry";
import { isFeatureRouteBlocked, type FeatureSetting } from "@/lib/modules/features";

export interface ModuleSetting {
  module_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

let cachedModules: ModuleSetting[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function getModuleSettings(forceRefresh = false): Promise<ModuleSetting[]> {
  const now = Date.now();
  if (!forceRefresh && cachedModules && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModules;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("module_settings")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch module settings:", error);
    return cachedModules ?? [];
  }

  cachedModules = data as ModuleSetting[];
  cacheTimestamp = now;
  return cachedModules;
}

export async function getActiveModuleKeys(forceRefresh = false): Promise<string[]> {
  const modules = await getModuleSettings(forceRefresh);
  return modules.filter((m) => m.is_active).map((m) => m.module_key);
}

export async function toggleModule(
  moduleKey: string,
  isActive: boolean,
  updatedBy: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("module_settings")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("module_key", moduleKey);

  if (error) {
    console.error("Failed to toggle module:", error);
    return { success: false, error: error.message };
  }

  // Invalidate cache
  cachedModules = null;
  cacheTimestamp = 0;

  return { success: true };
}

export function isModuleActive(modules: ModuleSetting[], key: string): boolean {
  return modules.find((m) => m.module_key === key)?.is_active ?? true;
}

export interface RouteToggleState {
  // module_settings keys that are switched on.
  activeModuleKeys: string[];
  navItemSettings: FeatureSetting[];
}

// Direct-URL gate for /dashboard routes. A route is blocked (the layout redirects
// to /dashboard) when any of these holds:
//   1. its module is switched off in module_settings;
//   2. its feature, or the feature's nav group, is off (see lib/modules/features.ts)
//      — this is what keeps "development" features unreachable until released;
//   3. the user's role is not permitted to see the module (RBAC).
// Checks 1 and 2 need `toggles`; without it only the role check runs. This
// supersedes the earlier "hide in sidebar + hub only" rule (changed 2026-10-01).
//
// Which routes belong to which module (`routePrefixes`) and whether the guard
// applies at all (`roleGoverned`) come from the module manifests in
// lib/modules/manifests. Administration is deliberately not governed: it keeps its
// own `(isAdmin || isHr)` sidebar gate and must stay reachable so an admin can
// always undo a toggle.
export function isRouteBlocked(
  pathname: string,
  permittedModuleKeys?: string[],
  toggles?: RouteToggleState,
): boolean {
  const routeModule = getModuleForPath(pathname);
  if (routeModule && !routeModule.roleGoverned) return false;

  if (toggles) {
    // An empty list means the settings could not be loaded (Administration is
    // always on), so fail open rather than lock every route.
    if (
      routeModule &&
      toggles.activeModuleKeys.length > 0 &&
      !toggles.activeModuleKeys.includes(routeModule.key)
    ) {
      return true;
    }
    if (isFeatureRouteBlocked(pathname, toggles.navItemSettings)) return true;
  }

  if (!routeModule || !permittedModuleKeys) return false;
  return !permittedModuleKeys.includes(routeModule.key);
}
