"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserPermissions, hasPermission, type UserPermissions } from "@/lib/permissions";

/**
 * Completion Plan 2.1 — mirrors hooks/use-qs-permissions.ts for the new
 * `planning` module. Actions seeded in role_permissions: schedule, calendars,
 * resources, delays, lookahead, baseline, programme, progress_review, tia,
 * levelling (see supabase/migrations/…_planning_role_permissions_seed.sql).
 * Productivity plan (20260922000004) adds: norms, task_work, productivity.
 */
export function usePlanningPermissions() {
  const [perms, setPerms] = useState<UserPermissions>({ roles: [], permissions: new Map() });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      const up = await getUserPermissions(supabase, user.id, "planning");
      setPerms(up);
      setLoaded(true);
    }
    void load();
  }, []);

  const roleCodes = perms.roles.map((r) => r.code);

  function can(action: string, field: "view" | "can_create" | "edit" | "delete" | "submit" | "approve" | "reject" | "export" | "configure"): boolean {
    return hasPermission(perms.permissions, "planning", action, field);
  }

  return {
    loaded,
    roleCodes,
    can,
    canEditSchedule: can("schedule", "edit"),
    canConfigureSchedule: can("schedule", "configure"),
    canReviewProgress: can("progress_review", "approve"),
    canSubmitProgress: can("progress_review", "edit"),
    canApproveProgramme: can("programme", "approve"),
    canSubmitProgramme: can("programme", "submit"),
    canEditDelays: can("delays", "edit"),
    canEditLookahead: can("lookahead", "edit"),
    canEditBaseline: can("baseline", "edit"),
    isClientOrConsultant: roleCodes.some((r) => ["EXT-CLT", "EXT-CON"].includes(r)),
  };
}
