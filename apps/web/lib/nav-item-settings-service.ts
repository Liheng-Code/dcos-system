import { createClient } from "@/lib/supabase/client";

export interface NavItemSetting {
  nav_key: string;
  module_key: string;
  node_type: "group" | "item";
  label: string;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

let cachedNavItems: NavItemSetting[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function getNavItemSettings(forceRefresh = false): Promise<NavItemSetting[]> {
  const now = Date.now();
  if (!forceRefresh && cachedNavItems && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedNavItems;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("nav_item_settings")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Failed to fetch nav item settings:", error);
    return cachedNavItems ?? [];
  }

  cachedNavItems = data as NavItemSetting[];
  cacheTimestamp = now;
  return cachedNavItems;
}

// Implemented as an upsert (not a plain .update() like toggleModule) because a
// nav_key may not have a row yet — absence of a row means "visible by default",
// so the first time an admin toggles a given nav item off, a row must be created.
export async function toggleNavItem(
  navKey: string,
  moduleKey: string,
  nodeType: "group" | "item",
  label: string,
  isActive: boolean,
  updatedBy: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("nav_item_settings")
    .upsert(
      {
        nav_key: navKey,
        module_key: moduleKey,
        node_type: nodeType,
        label,
        is_active: isActive,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "nav_key" },
    );

  if (error) {
    console.error("Failed to toggle nav item:", error);
    return { success: false, error: error.message };
  }

  // Invalidate cache
  cachedNavItems = null;
  cacheTimestamp = 0;

  return { success: true };
}

// Whether a nav item is on is resolved by isFeatureActive in lib/modules/features.ts
// (a row here wins; with no row the feature's release status decides). The same
// resolution blocks direct URL access to a switched-off item (isRouteBlocked).
