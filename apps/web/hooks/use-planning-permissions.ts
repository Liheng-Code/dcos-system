"use client";

import { hasPermission } from "@/lib/permissions";
import { usePlanningPermissionsContext } from "@/contexts/planning-permissions-context";

/**
 * Completion Plan 2.1 — mirrors hooks/use-qs-permissions.ts for the new
 * `planning` module. Actions seeded in role_permissions: schedule, calendars,
 * resources, delays, lookahead, baseline, programme, progress_review, tia,
 * levelling (see supabase/migrations/…_planning_role_permissions_seed.sql).
 * Productivity plan (20260922000004) adds: norms, task_work, productivity.
 *
 * The actual fetch now happens once per session in `PlanningPermissionsProvider`
 * (`contexts/planning-permissions-context.tsx`, mounted by `planning-module-shell.tsx`)
 * instead of once per page mount — this hook is a thin derived-selector over
 * that shared context, kept byte-for-byte the same return shape so none of
 * its 9 call sites need to change.
 */
export function usePlanningPermissions() {
  const { perms, loaded } = usePlanningPermissionsContext();

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
