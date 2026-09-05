"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * True when the current user may lock / unlock WBS nodes and edit a locked
 * subtree — admin or project manager. Unions `profiles.role` with
 * `user_roles.role_code`, mirroring the DB helper `public.is_wbs_manager()`
 * (20260904000001) and the union pattern in `use-admin-or-hr-guard.ts`.
 *
 * UI convenience only — the real boundary is the `trg_wbs_nodes_lock_guard`
 * trigger.
 */
const MANAGER_CODES = new Set(["admin", "project_manager", "L3"]);

export function useIsWbsManager(): boolean {
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || cancelled) return;
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle(),
        supabase.from("user_roles").select("role_code").eq("user_id", data.user.id),
      ]);
      if (cancelled) return;
      const codes = new Set((roleRows ?? []).map((r: { role_code: string }) => r.role_code));
      if (profile?.role) codes.add(profile.role as string);
      setIsManager([...codes].some((c) => MANAGER_CODES.has(c)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return isManager;
}
