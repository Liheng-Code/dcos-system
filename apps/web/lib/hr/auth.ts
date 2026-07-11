import { createAdminClient, createUserClient } from "@/lib/supabase/server"
import { getUserPermissions, hasPermission } from "@/lib/permissions"

export interface HrAuthResult {
  userId: string | null
  supabase: ReturnType<typeof createAdminClient> | null
  error: string | null
  status: number
  isAdmin: boolean
}

/**
 * Requires the user to be an HR admin (configure access on hr module)
 * or have legacy admin/HR_Manager role.
 */
export async function requireHrAdmin(): Promise<HrAuthResult> {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase: null, userId: null, isAdmin: false }

  const supabase = createAdminClient()
  const [hrPerms, profileRes, rolesRes] = await Promise.all([
    getUserPermissions(supabase, user.id, "hr"),
    supabase.from("profiles").select("role, level").eq("id", user.id).single(),
    supabase.from("user_roles").select("role_code").eq("user_id", user.id),
  ])

  const profile = profileRes.data as { role?: string | null; level?: string | null } | null
  const roleCodes = ((rolesRes.data ?? []) as { role_code: string | null }[]).map((r) => r.role_code)

  const hasRbacAdmin =
    hasPermission(hrPerms.permissions, "hr", "configure_policy", "configure") ||
    hasPermission(hrPerms.permissions, "hr", "configure_holiday", "configure") ||
    hasPermission(hrPerms.permissions, "hr", "adjust_balance", "configure")

  const legacyAdminRoles = ["admin", "HR_Manager", "hr_manager"]
  const legacyAdminLevels = ["HR_Manager", "HR_Admin", "Super_Admin", "Admin"]
  const hasLegacyAdmin =
    (profile?.role != null && legacyAdminRoles.includes(profile.role)) ||
    (profile?.level != null && legacyAdminLevels.includes(profile.level)) ||
    roleCodes.some((rc) => rc != null && ["admin", "HR_Manager"].includes(rc))

  if (!hasRbacAdmin && !hasLegacyAdmin) {
    return { error: "Only HR admin can perform this action", status: 403, supabase: null, userId: null, isAdmin: false }
  }

  return { error: null, status: 200, supabase, userId: user.id, isAdmin: true }
}

export interface HrActorResult {
  userId: string
  supabase: ReturnType<typeof createAdminClient>
  isAdmin: boolean
  isApprover: boolean
}

/**
 * Get the actor context for HR operations.
 * Returns the user's HR permissions from RBAC.
 */
export async function getHrActorContext(): Promise<HrActorResult | { error: string; status: number }> {
  const userClient = await createUserClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401 }

  const supabase = createAdminClient()
  const hrPerms = await getUserPermissions(supabase, user.id, "hr")

  const isAdmin =
    hasPermission(hrPerms.permissions, "hr", "configure_policy", "configure") ||
    hasPermission(hrPerms.permissions, "hr", "configure_holiday", "configure") ||
    hasPermission(hrPerms.permissions, "hr", "adjust_balance", "configure") ||
    hrPerms.roles.some((r) => r.code === "admin" || r.code === "HR_Manager")

  const isApprover =
    hasPermission(hrPerms.permissions, "hr", "approve_leave", "approve") ||
    hrPerms.roles.some((r) => {
      const level = [0, 1, 2, 3, 4, 5] // L0-L5 are supervisory
      return r.code.startsWith("L") && level.includes(Number(r.code.slice(1)))
    })

  return { userId: user.id, supabase, isAdmin, isApprover }
}
