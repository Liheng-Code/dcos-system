"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getActiveModuleKeys, toggleModule as toggleModuleService } from "@/lib/module-settings-service";
import {
  getNavItemSettings,
  toggleNavItem as toggleNavItemService,
  isNavItemActive as isNavItemActiveService,
  type NavItemSetting,
} from "@/lib/nav-item-settings-service";
import { createClient } from "@/lib/supabase/client";
import { usePermittedModules } from "@/hooks/use-permitted-modules";

interface ModuleSettingsContextValue {
  activeKeys: string[];
  loading: boolean;
  isModuleActive: (key: string) => boolean;
  toggleModule: (key: string, isActive: boolean) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
  navItemSettings: NavItemSetting[];
  navLoading: boolean;
  isNavItemActive: (navKey: string) => boolean;
  toggleNavItem: (
    navKey: string,
    moduleKey: string,
    nodeType: "group" | "item",
    label: string,
    isActive: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  refreshNavItems: () => Promise<void>;
  /** Sidebar module keys the current user's role(s) are permitted to see (Phase A). */
  permittedModuleKeys: string[];
  permittedLoading: boolean;
  /** Composes the global on/off toggle with the role-based permission check. */
  isModulePermitted: (key: string) => boolean;
  refreshPermittedModules: () => Promise<void>;
}

const ModuleSettingsContext = createContext<ModuleSettingsContextValue>({
  activeKeys: [],
  loading: true,
  isModuleActive: () => true,
  toggleModule: async () => ({ success: false }),
  refresh: async () => {},
  navItemSettings: [],
  navLoading: true,
  isNavItemActive: () => true,
  toggleNavItem: async () => ({ success: false }),
  refreshNavItems: async () => {},
  permittedModuleKeys: [],
  permittedLoading: true,
  isModulePermitted: () => true,
  refreshPermittedModules: async () => {},
});

export function useModuleSettings() {
  return useContext(ModuleSettingsContext);
}

export function ModuleSettingsProvider({ children }: { children: React.ReactNode }) {
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [navItemSettings, setNavItemSettings] = useState<NavItemSetting[]>([]);
  const [navLoading, setNavLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    const keys = await getActiveModuleKeys(true);
    setActiveKeys(keys);
    setLoading(false);
  }, []);

  const fetchNavItems = useCallback(async () => {
    const items = await getNavItemSettings(true);
    setNavItemSettings(items);
    setNavLoading(false);
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  useEffect(() => {
    fetchNavItems();
  }, [fetchNavItems]);

  const isModuleActive = useCallback(
    (key: string) => activeKeys.includes(key),
    [activeKeys],
  );

  const {
    permittedModuleKeys,
    loading: permittedLoading,
    refresh: refreshPermittedModules,
  } = usePermittedModules();

  const isModulePermitted = useCallback(
    (key: string) => isModuleActive(key) && permittedModuleKeys.includes(key),
    [isModuleActive, permittedModuleKeys],
  );

  const toggleModule = useCallback(
    async (key: string, isActive: boolean) => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return { success: false, error: "Not authenticated" };

      const result = await toggleModuleService(key, isActive, data.user.id);
      if (result.success) {
        await fetchKeys();
      }
      return result;
    },
    [fetchKeys],
  );

  const isNavItemActive = useCallback(
    (navKey: string) => isNavItemActiveService(navItemSettings, navKey),
    [navItemSettings],
  );

  const toggleNavItem = useCallback(
    async (
      navKey: string,
      moduleKey: string,
      nodeType: "group" | "item",
      label: string,
      isActive: boolean,
    ) => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return { success: false, error: "Not authenticated" };

      const result = await toggleNavItemService(navKey, moduleKey, nodeType, label, isActive, data.user.id);
      if (result.success) {
        await fetchNavItems();
      }
      return result;
    },
    [fetchNavItems],
  );

  return (
    <ModuleSettingsContext.Provider
      value={{
        activeKeys,
        loading,
        isModuleActive,
        toggleModule,
        refresh: fetchKeys,
        navItemSettings,
        navLoading,
        isNavItemActive,
        toggleNavItem,
        refreshNavItems: fetchNavItems,
        permittedModuleKeys,
        permittedLoading,
        isModulePermitted,
        refreshPermittedModules,
      }}
    >
      {children}
    </ModuleSettingsContext.Provider>
  );
}
