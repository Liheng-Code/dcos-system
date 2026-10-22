import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { serviceClient, sessionClient } from "@/lib/supabase";

// HQ roles (design 9.1). Four-eyes approvals are not built yet (Phase 3); until
// then the role alone decides.
export type HqRole = "owner" | "license_admin" | "account_manager" | "support" | "ops" | "viewer";

export const CAN = {
  manageLicenses: ["owner", "license_admin"],
  manageTenants: ["owner", "license_admin", "account_manager"],
  managePlans: ["owner"],
  manageKeys: ["owner"],
} satisfies Record<string, HqRole[]>;

export interface HqUser {
  authUserId: string;
  email: string;
  displayName: string;
  role: HqRole;
}

export const getHqUser = cache(async (): Promise<HqUser | null> => {
  const session = await sessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return null;
  const { data } = await serviceClient()
    .from("hq_users")
    .select("display_name, hq_role, active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data || !data.active) return null;
  return { authUserId: user.id, email: user.email ?? "", displayName: data.display_name, role: data.hq_role };
});

// Pages: redirect to the login page when not signed in as active HQ staff.
export async function requireHqUser(): Promise<HqUser> {
  const user = await getHqUser();
  if (!user) redirect("/login");
  return user;
}

export function can(user: HqUser, permission: keyof typeof CAN): boolean {
  return (CAN[permission] as HqRole[]).includes(user.role);
}

export class ForbiddenError extends Error {}

// Server actions: throw unless the caller holds the permission.
export async function requirePermission(permission: keyof typeof CAN): Promise<HqUser> {
  const user = await getHqUser();
  if (!user) throw new ForbiddenError("Your session has ended. Sign in again.");
  if (!can(user, permission)) throw new ForbiddenError("Your HQ role does not allow this.");
  return user;
}
