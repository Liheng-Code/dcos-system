import type { SupabaseClient } from "@supabase/supabase-js"

export interface HrPermissions {
  canAdmin: boolean
  isApprover: boolean
}

export async function checkHrPermissions(
  supabase: SupabaseClient,
  userId: string,
): Promise<HrPermissions> {
  const [profileRes, roleRes, configRes, requestRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase.from("user_roles")
      .select("role_code, roles(code, name, level, type)")
      .eq("user_id", userId),
    supabase.from("leave_approver_config")
      .select("id")
      .eq("approver_id", userId)
      .limit(1),
    supabase.from("leave_requests")
      .select("id")
      .or(`approver_1_id.eq."${userId}",approver_2_id.eq."${userId}"`)
      .limit(1),
  ] as const);

  const allRoles = (roleRes.data ?? []) as any[];

  // canAdmin: legacy admin profile flag or HR_Manager/admin RBAC role
  const isProfileAdmin = profileRes.data?.role === "admin";
  const hasAdminRole = allRoles.some((r: any) => r.role_code === "admin");
  const hasHrManagerRole = allRoles.some((r: any) => r.role_code === "HR_Manager");
  const canAdmin = isProfileAdmin || hasAdminRole || hasHrManagerRole;

  // isApprover: canAdmin OR holds a supervisory internal level (L1-L5)
  //             OR manually configured in leave_approver_config
  //             OR has been assigned as approver on past leave requests
  const internalRoles = allRoles
    .filter((r: any) => r.roles?.type === "internal_level" && r.roles?.level != null)
    .map((r: any) => r.roles.level as number);
  const hasSupervisoryRole = internalRoles.some((level) => level >= 1 && level <= 5);

  const hasConfigEntry = (configRes.data?.length ?? 0) > 0;
  const hasRequestHistory = (requestRes.data?.length ?? 0) > 0;

  const isApprover = canAdmin || hasSupervisoryRole || hasConfigEntry || hasRequestHistory;

  return { canAdmin, isApprover };
}
