"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserPermissions, hasPermission, type UserPermissions } from "@/lib/permissions";

export function useQsPermissions() {
  const [perms, setPerms] = useState<UserPermissions>({ roles: [], permissions: new Map() });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      const up = await getUserPermissions(supabase, user.id, "qs");
      setPerms(up);
      setLoaded(true);
    }
    void load();
  }, []);

  const roleCodes = perms.roles.map((r) => r.code);

  function can(action: string, field: "view" | "can_create" | "edit" | "delete" | "submit" | "approve" | "reject" | "export" | "configure"): boolean {
    return hasPermission(perms.permissions, "qs", action, field);
  }

  return {
    loaded,
    roleCodes,
    can,
    isDirector:  roleCodes.some((r) => ["L0", "L1", "L2"].includes(r)),
    isQsManager: roleCodes.some((r) => ["QS", "L0", "L1", "L2"].includes(r)),
    isPM:        roleCodes.some((r) => ["L3", "L0", "L1", "L2"].includes(r)),
    isClientOrConsultant: roleCodes.some((r) => ["EXT-CLT", "EXT-CON"].includes(r)),
  };
}
