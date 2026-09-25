"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserPermissions, type UserPermissions } from "@/lib/permissions";

const EMPTY_PERMS: UserPermissions = { roles: [], permissions: new Map() };

interface PlanningPermissionsContextValue {
  perms: UserPermissions;
  loaded: boolean;
}

const PlanningPermissionsContext = createContext<PlanningPermissionsContextValue>({
  perms: EMPTY_PERMS,
  loaded: false,
});

/**
 * Fetches the current user's `planning`-module permissions ONCE per mount of
 * this provider, instead of once per page — this is what `usePlanningPermissions()`
 * used to do on every single Planning page navigation (it's called from 9
 * different components, several of them twice per page). Mounted at the
 * Planning-module layout level (`planning-module-shell.tsx`), which — unlike
 * `page.tsx` — does NOT remount on in-module navigation, so this now fires
 * once per session-in-Planning. Mirrors `ProjectProvider`'s exact shape
 * (`components/dashboard/project-context.tsx`).
 */
export function PlanningPermissionsProvider({ children }: { children: ReactNode }) {
  const [perms, setPerms] = useState<UserPermissions>(EMPTY_PERMS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const up = await getUserPermissions(supabase, user.id, "planning");
      if (cancelled) return;
      setPerms(up);
      setLoaded(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PlanningPermissionsContext.Provider value={{ perms, loaded }}>
      {children}
    </PlanningPermissionsContext.Provider>
  );
}

export function usePlanningPermissionsContext() {
  return useContext(PlanningPermissionsContext);
}
