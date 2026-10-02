"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getActiveModuleKeys, toggleModule as toggleModuleService } from "@/lib/module-settings-service";
import {
  getNavItemSettings,
  toggleNavItem as toggleNavItemService,
  type NavItemSetting,
} from "@/lib/nav-item-settings-service";
import { isFeatureActive, moduleHasActiveFeature } from "@/lib/modules/features";
import { createClient } from "@/lib/supabase/client";
import { usePermittedModules } from "@/hooks/use-permitted-modules";

interface ModuleSettingsContextValue {
  activeKeys: string[];
  loading: boolean;
  isModuleActive: (key: string) => boolean;
  /** Module is on AND has at least one page a user can open; drives the sidebar and hub. */
  isModuleVisible: (key: string) => boolean;
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
  isModuleVisible: () => true,
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

  const supabase = useMemo(() => createClient(), []);

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

  // Realtime: live-sync module_settings and nav_item_settings from ANY client
  // (another tab, another admin, or the settings page itself). Keeps the sidebar
  // and module hub in sync without a page refresh — requires the tables to be on
  // the supabase_realtime publication (20260923000001_module_settings_realtime.sql).
  useEffect(() => {
    if (!supabase) return;
    let channel: RealtimeChannel | null = null;

    channel = supabase
      .channel("module-settings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "module_settings" },
        () => { void fetchKeys(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nav_item_settings" },
        () => { void fetchNavItems(); },
      )
      .subscribe();

    return () => {
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [supabase, fetchKeys, fetchNavItems]);

  const isModuleActive = useCallback(
    (key: string) => activeKeys.includes(key),
    [activeKeys],
  );

  const isModuleVisible = useCallback(
    (key: string) => activeKeys.includes(key) && moduleHasActiveFeature(key, navItemSettings),
    [activeKeys, navItemSettings],
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

  // A settings row wins; with no row a "released" feature is on and a
  // "development" feature is off (see lib/modules/features.ts).
  const isNavItemActive = useCallback(
    (navKey: string) => isFeatureActive(navKey, navItemSettings),
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
        isModuleVisible,
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
