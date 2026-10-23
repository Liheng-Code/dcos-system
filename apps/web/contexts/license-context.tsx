"use client";

// License state for the dashboard (design 7.3, E4): feeds the sidebar, module hub,
// route guard, Module Settings and banners. A UX layer only; the server enforces
// (proxy.ts, the invite route, the project-limit trigger).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LicenseSummary } from "@/lib/licensing/summary";
import { isManifestLicensed, isPathLicensed } from "@/lib/licensing/catalogue";
import { isNavKeyLicensed } from "@/lib/licensing/nav";

interface LicenseContextValue {
  summary: LicenseSummary | null;
  loading: boolean;
  // True when the license removes nothing (off, or no summary could be loaded).
  unrestricted: boolean;
  isManifestLicensed: (manifestKey: string) => boolean;
  isPathLicensed: (pathname: string) => boolean;
  isNavKeyLicensed: (navKey: string) => boolean;
  hasFeature: (feature: string) => boolean;
  refresh: (fromServer?: boolean) => Promise<void>;
}

const LicenseContext = createContext<LicenseContextValue>({
  summary: null,
  loading: true,
  unrestricted: true,
  isManifestLicensed: () => true,
  isPathLicensed: () => true,
  isNavKeyLicensed: () => true,
  hasFeature: () => true,
  refresh: async () => {},
});

export function useLicense() {
  return useContext(LicenseContext);
}

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<LicenseSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (fromServer = false) => {
    try {
      const res = await fetch(fromServer ? "/api/license?refresh=1" : "/api/license", { cache: "no-store" });
      setSummary(res.ok ? ((await res.json()) as LicenseSummary) : null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount, as the module settings provider does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const value = useMemo<LicenseContextValue>(() => {
    // Only an enforced license hides anything; report mode shows what would happen
    // on the License page but leaves the app alone.
    const unrestricted = !summary || !summary.enforced;
    const modules = new Set(summary?.modules ?? []);
    return {
      summary,
      loading,
      unrestricted,
      isManifestLicensed: (key) => unrestricted || isManifestLicensed(key, modules),
      isPathLicensed: (pathname) => unrestricted || isPathLicensed(pathname, modules),
      isNavKeyLicensed: (navKey) => unrestricted || isNavKeyLicensed(navKey, modules),
      hasFeature: (feature) => unrestricted || summary!.features.includes(feature),
      refresh,
    };
  }, [summary, loading, refresh]);

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}
