"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserPermissions } from "@/lib/permissions";
import { MODULE_KEY_MAP, ALL_MAPPED_RBAC_MODULES } from "@/lib/module-key-map";

export interface UsePermittedModulesResult {
  /** Sidebar module keys the current user's role(s) are permitted to see. */
  permittedModuleKeys: string[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const ALL_MODULE_KEYS = Object.keys(MODULE_KEY_MAP);

/**
 * Resolves which sidebar module keys (see `apps/web/lib/module-key-map.ts`) the current
 * user's role(s) are permitted to see. Part of Phase A of the sidebar/nav visibility fix —
 * this is a visibility hint for the UI, not a security boundary; nothing here is enforced at
 * the API or RLS layer.
 *
 * Reuses `getUserPermissions()` from `apps/web/lib/permissions.ts` unchanged for the actual
 * `role_permissions` lookups (that function keys off `user_roles.role_code` only, exactly as
 * its ~30 existing QS/Tender/Procurement/QTO consumers already expect — untouched here).
 */
export function usePermittedModules(): UsePermittedModulesResult {
  const [permittedModuleKeys, setPermittedModuleKeys] = useState<string[]>(ALL_MODULE_KEYS);
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      // Not signed in (or session not yet resolved) — nothing to gate against.
      setPermittedModuleKeys(ALL_MODULE_KEYS);
      setLoading(false);
      return;
    }

    // Effective role(s): union of the legacy `profiles.role` column with the real RBAC
    // `user_roles.role_code` join table — same pattern as `getActorContext()` in
    // apps/web/lib/admin-users/actor-context.ts. Used here only to detect the edge case of a
    // user with no resolvable role at all (see below); the actual permission lookups below
    // still go through `getUserPermissions()` unchanged, which resolves roles from
    // `user_roles` internally.
    const [{ data: profile }, { data: userRoleRows }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role_code").eq("user_id", userId),
    ]);

    const effectiveRoleCodes = new Set<string>(
      ((userRoleRows ?? []) as { role_code: string }[]).map((r) => r.role_code),
    );
    if (profile?.role) effectiveRoleCodes.add(profile.role as string);

    if (effectiveRoleCodes.size === 0) {
      // No resolvable role at all — there is nothing to gate against, so default to showing
      // everything rather than producing an empty sidebar for an unroled account.
      setPermittedModuleKeys(ALL_MODULE_KEYS);
      setLoading(false);
      return;
    }

    // System-wide: which of the RBAC module codes referenced anywhere in MODULE_KEY_MAP have
    // ANY seeded role_permissions row at all, for any role. A code with zero rows anywhere
    // cannot yet grant anyone permission — treating it as ungoverned (same as an empty array
    // in the map) avoids a surprise universal lockout of that sidebar section before Phase B
    // seeds a real matrix for it. This generalizes the `design`/BIM precedent (empty array,
    // confirmed zero rows) to every currently-unseeded code the investigation found
    // (construction, qa_qc, hse, account_finance, planning, reporting_kpi are all unseeded
    // today too) without hardcoding that list here.
    // Counted per code: one query for every row of every mapped code is cut off at the
    // API's 1,000-row limit once the permission table grows past it, which silently
    // dropped the most recently seeded codes and showed their modules to everyone.
    const seededCodes = new Set<string>();
    await Promise.all(
      ALL_MAPPED_RBAC_MODULES.map(async (code) => {
        const { count } = await supabase
          .from("role_permissions")
          .select("module", { count: "exact", head: true })
          .eq("module", code);
        if ((count ?? 0) > 0) seededCodes.add(code);
      }),
    );

    // Per-user: for each unique RBAC code in the map, does this user's role(s) have at least
    // one permission row for it (any action, any scope — presence alone is enough for
    // sidebar visibility).
    const uniqueCodes = Array.from(new Set(Object.values(MODULE_KEY_MAP).flat()));
    const userHasCode = new Map<string, boolean>();
    await Promise.all(
      uniqueCodes.map(async (code) => {
        const { permissions } = await getUserPermissions(supabase, userId, code);
        userHasCode.set(code, permissions.size > 0);
      }),
    );

    const permitted = Object.entries(MODULE_KEY_MAP)
      .filter(([, codes]) => {
        if (codes.length === 0) return true; // unmapped -> default-allow
        const anySeeded = codes.some((c) => seededCodes.has(c));
        if (!anySeeded) return true; // none of the governing codes are seeded anywhere yet -> default-allow
        return codes.some((c) => userHasCode.get(c));
      })
      .map(([key]) => key);

    setPermittedModuleKeys(permitted);
    setLoading(false);
  }, []);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return { permittedModuleKeys, loading, refresh: resolve };
}
