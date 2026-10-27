"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MODULE_KEY_MAP, ALL_MAPPED_RBAC_MODULES } from "@/lib/module-key-map";

export interface UsePermittedModulesResult {
  /** Sidebar module keys the current user's role(s) are permitted to see. */
  permittedModuleKeys: string[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const ALL_MODULE_KEYS = Object.keys(MODULE_KEY_MAP);
const CACHE_KEY = "dcos.permitted-modules";

interface ModuleAccess {
  has_role: boolean;
  seeded: string[];
  granted: string[];
}

/** Which sidebar keys the access allows. A code nobody has permission rows for yet is ungoverned (default-allow). */
function permittedFrom(access: ModuleAccess): string[] {
  if (!access.has_role) return ALL_MODULE_KEYS; // no resolvable role: nothing to gate against, show everything
  const seeded = new Set(access.seeded);
  const granted = new Set(access.granted);
  return Object.entries(MODULE_KEY_MAP)
    .filter(([, codes]) => {
      if (codes.length === 0) return true; // unmapped -> default-allow
      if (!codes.some((c) => seeded.has(c))) return true; // none of the governing codes are seeded anywhere yet -> default-allow
      return codes.some((c) => granted.has(c));
    })
    .map(([key]) => key);
}

function readCache(userId: string): string[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; keys: string[] };
    return parsed.userId === userId && Array.isArray(parsed.keys) ? parsed.keys : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, keys: string[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ userId, keys }));
  } catch {
    // storage unavailable (private mode): the next load just asks again
  }
}

/**
 * Resolves which sidebar module keys (see `apps/web/lib/module-key-map.ts`) the current
 * user's role(s) are permitted to see. A visibility hint for the UI, not a security boundary;
 * nothing here is enforced at the API or RLS layer.
 *
 * One RPC (`current_user_module_access`) instead of ~30 requests: the dashboard layout waits for
 * this on every page load. The answer is kept for the browser session (sessionStorage), so a
 * reload shows the sidebar at once and refreshes it in the background. `refresh()` always asks again.
 */
export function usePermittedModules(): UsePermittedModulesResult {
  const [permittedModuleKeys, setPermittedModuleKeys] = useState<string[]>(ALL_MODULE_KEYS);
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async (useCache = false) => {
    const supabase = createClient();
    // getSession reads the stored session (no network); RLS still checks the token on the RPC.
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      // Not signed in (or session not yet resolved) — nothing to gate against.
      setPermittedModuleKeys(ALL_MODULE_KEYS);
      setLoading(false);
      return;
    }

    const cached = useCache ? readCache(userId) : null;
    if (cached) {
      setPermittedModuleKeys(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const { data, error } = await supabase.rpc("current_user_module_access", { p_codes: ALL_MAPPED_RBAC_MODULES });
    if (error || !data) {
      // Keep what is shown (cache or the default-allow list) rather than hiding the sidebar.
      if (!cached) setPermittedModuleKeys(ALL_MODULE_KEYS);
      setLoading(false);
      return;
    }
    const keys = permittedFrom(data as ModuleAccess);
    writeCache(userId, keys);
    setPermittedModuleKeys(keys);
    setLoading(false);
  }, []);

  useEffect(() => {
    resolve(true);
  }, [resolve]);

  const refresh = useCallback(() => resolve(false), [resolve]);

  return { permittedModuleKeys, loading, refresh };
}
