import { type SupabaseClient } from "@supabase/supabase-js";

interface Permission {
  role_code: string;
  module: string;
  action: string;
  view: boolean;
  can_create: boolean;
  edit: boolean;
  delete: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  export: boolean;
  transmit: boolean;
  configure: boolean;
  reassign: boolean;
  scope: string | null;
}

export interface UserPermissions {
  roles: { code: string; name: string }[];
  permissions: Map<string, Permission>;
}

export async function getUserPermissions(
  supabase: SupabaseClient,
  userId: string,
  module: string,
): Promise<UserPermissions> {
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role_code")
    .eq("user_id", userId);

  if (!userRoles || userRoles.length === 0) {
    return { roles: [], permissions: new Map() };
  }

  const roleCodes = userRoles.map((r) => r.role_code);

  // These two only depend on roleCodes (just resolved above), not on each
  // other — run them concurrently instead of one-after-another.
  const [{ data: roles }, { data: perms }] = await Promise.all([
    supabase.from("roles").select("code, name").in("code", roleCodes),
    supabase.from("role_permissions").select("*").in("role_code", roleCodes).eq("module", module),
  ]);

  const permissionMap = new Map<string, Permission>();
  if (perms) {
    for (const p of perms as Permission[]) {
      const key = `${p.module}__${p.action}`;
      const existing = permissionMap.get(key);
      if (existing) {
        permissionMap.set(key, {
          ...existing,
          view: existing.view || p.view,
          can_create: existing.can_create || p.can_create,
          edit: existing.edit || p.edit,
          delete: existing.delete || p.delete,
          submit: existing.submit || p.submit,
          approve: existing.approve || p.approve,
          reject: existing.reject || p.reject,
          export: existing.export || p.export,
          transmit: existing.transmit || p.transmit,
          configure: existing.configure || p.configure,
          reassign: existing.reassign || p.reassign,
        });
      } else {
        permissionMap.set(key, { ...p });
      }
    }
  }

  return {
    roles: (roles ?? []) as { code: string; name: string }[],
    permissions: permissionMap,
  };
}

export function hasPermission(
  permissions: Map<string, Permission>,
  module: string,
  action: string,
  field: keyof Permission,
): boolean {
  const p = permissions.get(`${module}__${action}`);
  if (!p) return false;
  const value = p[field];
  return typeof value === "boolean" ? value : false;
}
