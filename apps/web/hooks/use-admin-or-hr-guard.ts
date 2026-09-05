"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * 02-USR Phase 4 — shared client-side route guard for the new
 * `/dashboard/administration/*` pages (User Management, Roles & Permissions, Departments,
 * Security, Audit Logs). Unions `profiles.role` with `user_roles.role_code` before checking
 * membership in the same HR-Manager-or-admin set used by the sidebar gate and every Phase 3
 * API route's `getActorContext()`/`HR_ROLE_CODES` (`apps/web/lib/admin-users/actor-context.ts`)
 * — do not check `profiles.role` alone, or a user who only holds the RBAC `role_code` would be
 * incorrectly redirected away.
 *
 * This is a UI-level courtesy only, matching every other client-side gate in this codebase
 * (e.g. `/dashboard/settings`'s own admin check) — the real authorization boundary is each
 * API route's own server-side `getActorContext()` check.
 */
const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);

export function useAdminOrHrGuard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/");
        return;
      }
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle(),
        supabase.from("user_roles").select("role_code").eq("user_id", data.user.id),
      ]);
      if (cancelled) return;
      const codes = new Set((roleRows ?? []).map((r: { role_code: string }) => r.role_code));
      if (profile?.role) codes.add(profile.role as string);
      const isHr = [...codes].some((c) => HR_ROLE_CODES.has(c));
      if (!isHr) {
        router.replace("/dashboard");
        return;
      }
      setAllowed(true);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { checking: checking || !allowed, allowed };
}
