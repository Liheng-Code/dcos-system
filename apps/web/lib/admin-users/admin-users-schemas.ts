import { z } from "zod";

/**
 * Legacy `profiles.role` values — the 5-value hardcoded check constraint from
 * `20260526_0001_create_profiles.sql` (`admin | project_manager | contractor | inspector |
 * viewer`). Distinct from `user_role_codes` (the real, granular RBAC `role_code`s, e.g.
 * "Structural_Engineer") — see `00-Master.md` §7.2's two-role-system flag.
 */
const LEGACY_ROLE_VALUES = ["admin", "project_manager", "contractor", "inspector", "viewer"] as const;

/**
 * POST /api/admin/users/invite (F1, BR1.01)
 *
 * `employee_id` is intentionally NOT accepted here even though `08-API-Reference.md`'s sample
 * payload includes it — `apps/web/app/api/hr/employees/route.ts` treats `employee_id` as
 * assigned by a database trigger from `join_date` and read-only afterwards; accepting a
 * client-supplied value here would conflict with that. See final report for this judgment call.
 */
export const inviteUserSchema = z.object({
  full_name: z.string().trim().min(1, "full_name is required"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  department_id: z.string().uuid().nullable().optional(),
  position: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  role: z.enum(LEGACY_ROLE_VALUES).optional(),
  user_role_codes: z.array(z.string().trim().min(1)).optional(),
  /** Optional override for where the emailed activation link lands (see redirectTo note). */
  redirect_to: z.string().url().optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

/** POST /api/admin/users/[id]/force-reset (F7) — no body required, only an optional redirect. */
export const forceResetSchema = z.object({
  redirect_to: z.string().url().optional(),
});

/**
 * POST /api/admin/users/[id]/{lock,unlock,suspend,disable} (F3, BR3.01)
 * `reason` is only meaningful for suspend/disable; harmless if sent for lock/unlock.
 */
export const accountStatusActionSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});

/** GET /api/admin/users (list + filters) */
export const listUsersQuerySchema = z.object({
  account_status: z.enum(["INVITED", "ACTIVE", "LOCKED", "SUSPENDED", "DISABLED"]).optional(),
  department_id: z.string().uuid().optional(),
  role: z.string().optional(),
  q: z.string().trim().optional(),
});

/**
 * GET /api/admin/audit-logs (Phase 4 gap-fill for USR-06 Audit Log Page).
 *
 * `GET /api/admin/dashboard/account-summary`'s `recent_activity` is a fixed "most recent 20,
 * lifecycle events only" feed with no filters/pagination — too thin to power a proper
 * filterable/paginated audit log page. This is a light, minimal addition (not new
 * architecture): same admin-only actor-check pattern as every other route in this module,
 * reading `user_audit_logs` directly with filters/pagination.
 */
export const auditLogsQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  actor_id: z.string().uuid().optional(),
  event_type: z.string().trim().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
