import { createClient } from "@/lib/supabase/client";

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

export function isRouteBlocked(pathname: string, activeKeys: string[]): boolean {
  const routeModuleMap: Record<string, string> = {
    "/dashboard/projects": "project",
    "/dashboard/wbs": "project",
    "/dashboard/tasks": "project",
    "/dashboard/stakeholders": "project",
    "/dashboard/reports": "reporting",
    "/dashboard/insights": "reporting",
    "/dashboard/documents": "document_control",
    "/dashboard/transmittals": "document_control",
    "/dashboard/planning": "planning",
    "/dashboard/design": "design",
    "/dashboard/procurement": "procurement",
    "/dashboard/qs": "qs",
    "/dashboard/tenders": "qs",
    "/dashboard/subcontractors": "qs",
    "/dashboard/contracts": "qs",
    "/dashboard/qto": "qs",
    "/dashboard/site": "construction",
    "/dashboard/qaqc": "construction",
    "/dashboard/hse": "construction",
    "/dashboard/hr": "hr",
    "/dashboard/account": "account",
    "/dashboard/administration": "administration",
    "/dashboard/settings": "administration",
  };

  for (const [prefix, moduleKey] of Object.entries(routeModuleMap)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return !activeKeys.includes(moduleKey);
    }
  }

  return false;
}
