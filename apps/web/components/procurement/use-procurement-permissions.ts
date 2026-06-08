import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserPermissions, hasPermission, type UserPermissions } from "@/lib/permissions";

export type ProcAction =
  | "pr"
  | "po"
  | "goods_receipt"
  | "invoice"
  | "rfq"
  | "supplier"
  | "inventory"
  | "notifications"
  | "audit_log";

export type ProcPermField = "view" | "can_create" | "edit" | "delete" | "submit" | "approve" | "reject";

export function useProcurementPermissions(actions: ProcAction[]) {
  const [perms, setPerms] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      getUserPermissions(supabase, user.id, "procurement").then((up) => {
        setPerms(up);
        setLoading(false);
      });
    });
  }, []);

  function can(action: ProcAction, field: ProcPermField): boolean {
    if (!perms) return false;
    return hasPermission(perms.permissions, "procurement", action, field);
  }

  return { perms, loading, can };
}
