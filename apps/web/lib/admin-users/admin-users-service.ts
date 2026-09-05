import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-error";
import { writeAuditLog, USR_EVENT_TYPES, ACCOUNT_LIFECYCLE_FEED_EVENT_TYPES } from "./audit-log";
import type { InviteUserInput } from "./admin-users-schemas";

export type AccountStatus = "INVITED" | "ACTIVE" | "LOCKED" | "SUSPENDED" | "DISABLED";
export const ACCOUNT_STATUSES: AccountStatus[] = ["INVITED", "ACTIVE", "LOCKED", "SUSPENDED", "DISABLED"];

// ---------------------------------------------------------------------------
// F1 — Account Creation by Invitation (BR1.01–BR1.06)
// ---------------------------------------------------------------------------

export async function inviteUser(admin: SupabaseClient, input: InviteUserInput, actorId: string) {
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { full_name: input.full_name },
    redirectTo: input.redirect_to,
  });

  if (inviteError) {
    const message = inviteError.message ?? "";
    if (/already registered|already exists|already been registered/i.test(message)) {
      throw new ApiError(409, "USR_EMAIL_EXISTS", "A user with this email already exists.");
    }
    throw new ApiError(400, "USR_INVITE_FAILED", message || "Failed to send invitation.");
  }

  const newUser = inviteData.user;
  if (!newUser) {
    throw new ApiError(500, "USR_INVITE_FAILED", "Invite succeeded but no user was returned.");
  }
  const newId = newUser.id;

  // handle_new_user() (SECURITY DEFINER trigger on auth.users) already inserted a bare
  // profiles row (id, full_name, email) by the time inviteUserByEmail() returns. We upsert
  // rather than update so this endpoint is also correct if that trigger's insert is ever
  // delayed/skipped — account_status is set explicitly here per BR1.02, not left to the
  // trigger (which has no knowledge of this column).
  const profileUpsert: Record<string, unknown> = {
    id: newId,
    full_name: input.full_name,
    email: input.email,
    account_status: "INVITED" satisfies AccountStatus,
  };
  if (input.department_id !== undefined) profileUpsert.department_id = input.department_id;
  if (input.position !== undefined) profileUpsert.job_title = input.position;
  if (input.phone !== undefined) profileUpsert.phone = input.phone;
  if (input.role !== undefined) profileUpsert.role = input.role;

  const { error: upsertError } = await admin.from("profiles").upsert(profileUpsert, { onConflict: "id" });
  if (upsertError) {
    throw new ApiError(500, "USR_DB_ERROR", upsertError.message);
  }

  if (input.user_role_codes && input.user_role_codes.length > 0) {
    const rows = input.user_role_codes.map((role_code) => ({ user_id: newId, role_code }));
    const { error: rolesError } = await admin.from("user_roles").insert(rows);
    if (rolesError) {
      // Role assignment failing shouldn't roll back the whole invite — the account still
      // exists and is invited; surface the problem without discarding the create.
      console.error(`[invite] failed to assign user_role_codes for ${newId}:`, rolesError.message);
    }
  }

  await writeAuditLog(admin, {
    user_id: newId,
    actor_id: actorId,
    event_type: USR_EVENT_TYPES.ACCOUNT_INVITED,
    new_value: { account_status: "INVITED", email: input.email },
    note: `Invited by admin/HR.`,
  });

  return {
    id: newId,
    email: input.email,
    account_status: "INVITED" as AccountStatus,
    created_at: newUser.created_at ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// F7 — Admin Force Password Reset (BR7.01–BR7.04)
// ---------------------------------------------------------------------------

export async function forceResetPassword(
  admin: SupabaseClient,
  input: { targetId: string; actorId: string; redirectTo?: string },
) {
  if (input.targetId === input.actorId) {
    throw new ApiError(
      400,
      "USR_SELF_TARGET",
      "Use /api/auth/forgot-password to reset your own password.",
    );
  }

  const { data: target, error } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", input.targetId)
    .maybeSingle<{ id: string; email: string }>();

  if (error) throw new ApiError(500, "USR_DB_ERROR", error.message);
  if (!target) throw new ApiError(404, "USR_USER_NOT_FOUND", "User not found.");

  const { error: resetError } = await admin.auth.resetPasswordForEmail(target.email, {
    redirectTo: input.redirectTo,
  });
  if (resetError) throw new ApiError(500, "USR_RESET_FAILED", resetError.message);

  await writeAuditLog(admin, {
    user_id: target.id,
    actor_id: input.actorId,
    event_type: USR_EVENT_TYPES.FORCE_RESET_TRIGGERED,
    note: `Reset link triggered by admin for ${target.email}.`,
  });

  return { ok: true, message: `Reset link sent to ${target.email}` };
}

// ---------------------------------------------------------------------------
// F3 — Admin-Triggered Account Status Actions (BR3.01–BR3.07)
// ---------------------------------------------------------------------------

interface AccountStatusTransition {
  to: AccountStatus;
  /**
   * Source states from which this action is a valid transition, per the state diagram in
   * `02-Functional-Specification.md` §2.2/§2.3. A call where the account is already in `to`
   * is treated as an idempotent no-op (see JUDGMENT CALL note in transitionAccountStatus).
   */
  validFrom: AccountStatus[];
  revoke: boolean;
  eventType: string;
}

export const ACCOUNT_STATUS_ACTIONS: Record<string, AccountStatusTransition> = {
  lock: { to: "LOCKED", validFrom: ["ACTIVE"], revoke: true, eventType: USR_EVENT_TYPES.ACCOUNT_LOCKED },
  unlock: {
    to: "ACTIVE",
    validFrom: ["LOCKED", "SUSPENDED", "DISABLED"],
    revoke: false,
    eventType: USR_EVENT_TYPES.ACCOUNT_UNLOCKED,
  },
  suspend: { to: "SUSPENDED", validFrom: ["ACTIVE"], revoke: true, eventType: USR_EVENT_TYPES.ACCOUNT_SUSPENDED },
  disable: {
    to: "DISABLED",
    validFrom: ["ACTIVE", "SUSPENDED", "LOCKED"],
    revoke: true,
    eventType: USR_EVENT_TYPES.ACCOUNT_DISABLED,
  },
};

/**
 * JUDGMENT CALL (flagged in final report — `08-API-Reference.md` left this `[TBD — human to
 * confirm]`): calling lock/unlock/suspend/disable on an account already in the exact target
 * state is treated as an idempotent no-op (200, `idempotent: true`), not a 409. Simpler client
 * code, matches REST convention for state-setting endpoints. A call from a state NOT on the
 * diagram's valid-from list for that action (e.g. `suspend` on a `LOCKED` account) is still a
 * hard `409 USR_INVALID_TRANSITION`.
 */
export async function transitionAccountStatus(
  admin: SupabaseClient,
  input: { action: string; targetId: string; actorId: string; reason?: string | null },
) {
  const transition = ACCOUNT_STATUS_ACTIONS[input.action];
  if (!transition) {
    throw new ApiError(400, "USR_UNKNOWN_ACTION", `Unknown account status action: ${input.action}`);
  }

  // BR3.07 — a staff member may never self-trigger any of these four actions.
  if (input.targetId === input.actorId) {
    throw new ApiError(403, "USR_SELF_TARGET", "You cannot perform this action on your own account.");
  }

  const { data: current, error: fetchError } = await admin
    .from("profiles")
    .select("id, account_status, suspended_reason")
    .eq("id", input.targetId)
    .maybeSingle<{ id: string; account_status: AccountStatus; suspended_reason: string | null }>();

  if (fetchError) throw new ApiError(500, "USR_DB_ERROR", fetchError.message);
  if (!current) throw new ApiError(404, "USR_USER_NOT_FOUND", "User not found.");

  const currentStatus = current.account_status;

  if (currentStatus === transition.to) {
    return { ok: true, account_status: currentStatus, idempotent: true };
  }

  if (!transition.validFrom.includes(currentStatus)) {
    throw new ApiError(
      409,
      "USR_INVALID_TRANSITION",
      `Cannot ${input.action} an account currently in ${currentStatus} state.`,
    );
  }

  const updatePayload: Record<string, unknown> = { account_status: transition.to };
  if (input.action === "suspend") updatePayload.suspended_reason = input.reason ?? null;
  if (input.action === "unlock") updatePayload.suspended_reason = null; // stale reason cleanup

  const { error: updateError } = await admin.from("profiles").update(updatePayload).eq("id", input.targetId);
  if (updateError) throw new ApiError(500, "USR_DB_ERROR", updateError.message);

  if (transition.revoke) {
    // Deletes the target's auth.sessions rows (service-role RPC), preventing further token
    // refresh — see migration 20260824050000_usr_revoke_user_sessions_function.sql for why
    // this replaces the previously-broken auth.admin.signOut(userId) call. Best-effort: a
    // revoke failure must never block the account_status transition itself.
    const { error: revokeError } = await admin.rpc("revoke_user_sessions", {
      target_user_id: input.targetId,
    });
    if (revokeError) {
      console.error("[admin-users] revoke_user_sessions failed:", revokeError.message);
    }
  }

  await writeAuditLog(admin, {
    user_id: input.targetId,
    actor_id: input.actorId,
    event_type: transition.eventType,
    old_value: { account_status: currentStatus },
    new_value: { account_status: transition.to },
    note: input.reason ?? null,
  });

  if (transition.revoke) {
    await writeAuditLog(admin, {
      user_id: input.targetId,
      actor_id: input.actorId,
      event_type: USR_EVENT_TYPES.SESSION_REVOKED,
      note: `Session revoked as part of "${input.action}".`,
    });
  }

  return { ok: true, account_status: transition.to, idempotent: false };
}

// ---------------------------------------------------------------------------
// GET /api/admin/users — list with filters
// ---------------------------------------------------------------------------

interface UserListRow {
  id: string;
  full_name: string;
  email: string;
  employee_id: string | null;
  department_id: string | null;
  role: string;
  status: string;
  account_status: string;
  last_login_at: string | null;
  password_changed_at: string | null;
  departments: { department_name: string } | null;
}

export async function listUsers(
  admin: SupabaseClient,
  filters: { account_status?: string; department_id?: string; role?: string; q?: string },
) {
  let query = admin
    .from("profiles")
    .select(
      "id, full_name, email, employee_id, department_id, role, status, account_status, last_login_at, password_changed_at, departments(department_name)",
      { count: "exact" },
    );

  if (filters.account_status) query = query.eq("account_status", filters.account_status);
  if (filters.department_id) query = query.eq("department_id", filters.department_id);
  if (filters.role) query = query.eq("role", filters.role);
  if (filters.q) {
    const term = filters.q.replace(/[%,]/g, "");
    query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,employee_id.ilike.%${term}%`);
  }

  const { data, error, count } = await query
    .order("full_name", { ascending: true })
    .returns<UserListRow[]>();

  if (error) throw new ApiError(500, "USR_DB_ERROR", error.message);

  const users = (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    employee_id: row.employee_id,
    department_id: row.department_id,
    department_name: row.departments?.department_name ?? null,
    role: row.role,
    status: row.status,
    account_status: row.account_status,
    last_login_at: row.last_login_at,
    password_changed_at: row.password_changed_at,
  }));

  return { users, total: count ?? users.length };
}

// ---------------------------------------------------------------------------
// F11 — GET /api/admin/dashboard/account-summary
// ---------------------------------------------------------------------------

interface RecentActivityRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  user_id: string;
  created_at: string;
  actor: { full_name: string } | null;
  subject: { full_name: string } | null;
}

export async function getAccountSummary(admin: SupabaseClient) {
  const countResults = await Promise.all(
    ACCOUNT_STATUSES.map((status) =>
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("account_status", status),
    ),
  );

  const counts: Record<AccountStatus, number> = {
    INVITED: 0,
    ACTIVE: 0,
    LOCKED: 0,
    SUSPENDED: 0,
    DISABLED: 0,
  };
  let total = 0;
  ACCOUNT_STATUSES.forEach((status, index) => {
    const c = countResults[index].count ?? 0;
    counts[status] = c;
    total += c;
  });

  const { data: activity, error: activityError } = await admin
    .from("user_audit_logs")
    .select("id, event_type, actor_id, user_id, created_at, actor:actor_id(full_name), subject:user_id(full_name)")
    .in("event_type", ACCOUNT_LIFECYCLE_FEED_EVENT_TYPES)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<RecentActivityRow[]>();

  if (activityError) throw new ApiError(500, "USR_DB_ERROR", activityError.message);

  const recent_activity = (activity ?? []).map((row) => ({
    id: row.id,
    event_type: row.event_type,
    // BR8.03 / 08-API-Reference.md — actor_id IS NULL renders as "System", resolved here so
    // every consumer gets the correct label without re-implementing the null check.
    actor_name: row.actor_id ? row.actor?.full_name ?? "Unknown" : "System",
    actor_id: row.actor_id,
    user_name: row.subject?.full_name ?? "Unknown",
    user_id: row.user_id,
    created_at: row.created_at,
  }));

  return { counts, total, recent_activity };
}

// ---------------------------------------------------------------------------
// GET /api/admin/audit-logs — Phase 4 gap-fill for USR-06 (Audit Log Page).
// See admin-users-schemas.ts's auditLogsQuerySchema doc comment for why this exists.
// ---------------------------------------------------------------------------

export interface AuditLogFilters {
  user_id?: string;
  actor_id?: string;
  event_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

interface AuditLogListRow {
  id: string;
  event_type: string;
  actor_id: string | null;
  user_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  actor: { full_name: string } | null;
  subject: { full_name: string } | null;
}

export async function listAuditLogs(admin: SupabaseClient, filters: AuditLogFilters) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = admin
    .from("user_audit_logs")
    .select(
      "id, event_type, actor_id, user_id, old_value, new_value, note, created_at, actor:actor_id(full_name), subject:user_id(full_name)",
      { count: "exact" },
    );

  if (filters.user_id) query = query.eq("user_id", filters.user_id);
  if (filters.actor_id) query = query.eq("actor_id", filters.actor_id);
  if (filters.event_type) query = query.eq("event_type", filters.event_type);
  if (filters.date_from) query = query.gte("created_at", filters.date_from);
  if (filters.date_to) query = query.lte("created_at", filters.date_to);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
    .returns<AuditLogListRow[]>();

  if (error) throw new ApiError(500, "USR_DB_ERROR", error.message);

  const logs = (data ?? []).map((row) => ({
    id: row.id,
    event_type: row.event_type,
    // BR8.03 — same "System" convention as getAccountSummary's feed.
    actor_name: row.actor_id ? row.actor?.full_name ?? "Unknown" : "System",
    actor_id: row.actor_id,
    user_name: row.subject?.full_name ?? "Unknown",
    user_id: row.user_id,
    old_value: row.old_value,
    new_value: row.new_value,
    note: row.note,
    created_at: row.created_at,
  }));

  return { logs, total: count ?? logs.length, limit, offset };
}
