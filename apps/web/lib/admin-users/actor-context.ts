import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Role-code set that grants HR/Admin-equivalent authority for account-lifecycle actions.
 *
 * Reproduced verbatim from `apps/web/app/api/hr/employees/[id]/route.ts`'s `HR_ROLE_CODES`
 * (per `00-Master.md` §7.2 — "admin" and "HR_Manager" are treated as an equivalent-authority
 * set for this module's purposes, mirroring the `public.is_hr()` SQL helper). Every admin-check
 * in this module (`ACCOUNT_STATUS_ACTIONS`, invite, force-reset, list, dashboard summary) must
 * union both `profiles.role` (legacy single-value column) and `user_roles.role_code` (the real
 * RBAC join table) — do not check only one, or a user who holds only an RBAC role_code (no
 * legacy `profiles.role`) would be silently locked out.
 */
export const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);

export interface ActorContext {
  profile: { id: string; role: string } | null;
  /** True if the actor has Admin-or-HR equivalent authority (see HR_ROLE_CODES above). */
  isHr: boolean;
}

/**
 * Resolves the acting user's authorization context for USR account-lifecycle endpoints.
 *
 * Mirrors `getActorContext()` in `apps/web/app/api/hr/employees/[id]/route.ts` exactly —
 * unions `profiles.role` with `user_roles.role_code` before checking membership in
 * `HR_ROLE_CODES`. Extracted here so the new `/api/admin/users/*` and `/api/auth/*` routes
 * (which are not part of the HR employees resource) can reuse the identical scaffolding
 * without duplicating it.
 */
export async function getActorContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActorContext> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role_code").eq("user_id", userId),
  ]);

  const roleCodes = new Set<string>(
    ((roles ?? []) as { role_code: string }[]).map((row) => row.role_code),
  );
  if (profile?.role) roleCodes.add(profile.role as string);

  return {
    profile: profile as { id: string; role: string } | null,
    isHr: [...roleCodes].some((role) => HR_ROLE_CODES.has(role)),
  };
}
