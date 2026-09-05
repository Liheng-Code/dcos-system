import { createClient as createBareSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-error";
import { writeAuditLog, USR_EVENT_TYPES } from "@/lib/admin-users/audit-log";
import { describePasswordPolicyFailures } from "./password-policy";

interface ProfileRow {
  id: string;
  email: string;
  account_status: string;
}

/**
 * Verifies a plaintext password against Supabase Auth without disturbing the caller's
 * existing session cookies. There is no direct "verify password" Admin API, so this uses
 * the standard technique: attempt `signInWithPassword` on a throwaway, anon-key client and
 * discard the resulting session — only the success/failure of the attempt is used.
 */
async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const anonClient = createBareSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await anonClient.auth.signInWithPassword({ email, password });
  return !error;
}

/**
 * F5 — Self-Service Password Management (BR5.01–BR5.04).
 *
 * `admin` must be the service-role client (`createAdminClient()`); `userId` is the caller's
 * own id, taken from their session (`getUser()`), never from the request body.
 */
export async function changePassword(
  admin: SupabaseClient,
  userId: string,
  input: { current_password: string; new_password: string },
  currentSessionId: string | null,
) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, account_status")
    .eq("id", userId)
    .maybeSingle<ProfileRow>();

  if (profileError) throw new ApiError(500, "USR_DB_ERROR", profileError.message);
  if (!profile) throw new ApiError(404, "USR_USER_NOT_FOUND", "User not found.");

  const currentPasswordValid = await verifyCurrentPassword(profile.email, input.current_password);
  if (!currentPasswordValid) {
    throw new ApiError(400, "USR_INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
  }

  const failures = describePasswordPolicyFailures(input.new_password);
  if (failures.length > 0) {
    throw new ApiError(400, "USR_PASSWORD_POLICY", `Password does not meet policy: ${failures.join(", ")}`);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: input.new_password,
  });
  if (updateError) throw new ApiError(500, "USR_DB_ERROR", updateError.message);

  const nowIso = new Date().toISOString();
  const { error: touchError } = await admin
    .from("profiles")
    .update({ password_changed_at: nowIso })
    .eq("id", userId);
  if (touchError) throw new ApiError(500, "USR_DB_ERROR", touchError.message);

  // BR5.03 — invalidate all other active sessions, keeping the caller's own session (the one
  // they just used to submit this request) alive. Uses the revoke_user_sessions RPC (see
  // migration 20260824050000_usr_revoke_user_sessions_function.sql) rather than the broken
  // auth.admin.signOut(userId, "others") call this previously reused from the HR route's
  // precedent — that call needs the target's own JWT, which an admin-client call never has.
  const { error: revokeError } = await admin.rpc("revoke_user_sessions", {
    target_user_id: userId,
    except_session_id: currentSessionId,
  });
  if (revokeError) {
    // Best-effort — never fail the password change because revocation could not be verified.
    console.error("[auth/change-password] revoke_user_sessions failed:", revokeError.message);
  }

  await writeAuditLog(admin, {
    user_id: userId,
    actor_id: userId,
    event_type: USR_EVENT_TYPES.PASSWORD_CHANGED,
    note: "Self-service password change.",
  });
  await writeAuditLog(admin, {
    user_id: userId,
    actor_id: userId,
    event_type: USR_EVENT_TYPES.SESSION_REVOKED,
    note: "Other sessions revoked after password change.",
  });

  return {
    ok: true,
    message: "Password changed. You have been signed out of your other devices.",
  };
}

/**
 * F6 — Forgot Password / Self-Service Reset (BR6.01–BR6.06).
 *
 * Always returns the identical generic response regardless of whether `email` matches an
 * account (BR6.01) — the caller (route handler) must return this same body/status for every
 * outcome, including malformed input beyond the `400` email-format case. This function does
 * the matched/unmatched work but keeps timing close by always performing one DB round trip.
 */
export async function forgotPassword(
  admin: SupabaseClient,
  input: { email: string; redirectTo?: string },
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", input.email)
    .maybeSingle<{ id: string; email: string }>();

  if (profile) {
    const { error: resetError } = await admin.auth.resetPasswordForEmail(profile.email, {
      redirectTo: input.redirectTo,
    });
    // A failure to send here must not leak existence via a different response — log, don't throw.
    if (resetError) {
      console.error(`[forgot-password] resetPasswordForEmail failed for user ${profile.id}:`, resetError.message);
    } else {
      await writeAuditLog(admin, {
        user_id: profile.id,
        actor_id: profile.id,
        event_type: USR_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
        note: "Forgot-password link requested.",
      });
    }
  }

  return {
    ok: true,
    message: "If an account exists for this email, a password reset link has been sent.",
  };
}

/**
 * F2/F6 — Reset-Password Completion (BR2.01–BR2.05, BR6.03–BR6.05).
 *
 * `userClient` must be the cookie-bound client already carrying the Supabase recovery
 * session established client-side from the emailed token (per `08-API-Reference.md`'s note
 * that the exact recovery-session handoff is this route's implementation detail). `admin` is
 * the service-role client used for the `profiles` side effects and audit log, since the
 * recovery session's own JWT does not carry `is_admin()`/`is_hr()` and must not need to.
 */
export async function resetPassword(
  userClient: SupabaseClient,
  admin: SupabaseClient,
  input: { new_password: string },
) {
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    throw new ApiError(
      400,
      "USR_INVALID_TOKEN",
      "This link has expired or already been used. Request a new one.",
    );
  }

  const { error: updateError } = await userClient.auth.updateUser({
    password: input.new_password,
  });
  if (updateError) {
    throw new ApiError(
      400,
      "USR_INVALID_TOKEN",
      "This link has expired or already been used. Request a new one.",
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, account_status")
    .eq("id", user.id)
    .maybeSingle<{ id: string; account_status: string }>();
  if (profileError) throw new ApiError(500, "USR_DB_ERROR", profileError.message);

  const wasActivation = profile?.account_status === "INVITED";
  const nowIso = new Date().toISOString();

  const updatePayload: Record<string, unknown> = { password_changed_at: nowIso };
  if (wasActivation) {
    updatePayload.account_status = "ACTIVE";
    updatePayload.first_login_at = nowIso; // BR2.03 — reused as activation-completion timestamp.
  }

  const { error: touchError } = await admin.from("profiles").update(updatePayload).eq("id", user.id);
  if (touchError) throw new ApiError(500, "USR_DB_ERROR", touchError.message);

  // BR2.04 / BR6.05 / 08-API-Reference.md: single event, chosen by branch — not both.
  await writeAuditLog(admin, {
    user_id: user.id,
    actor_id: user.id,
    event_type: wasActivation ? USR_EVENT_TYPES.ACCOUNT_ACTIVATED : USR_EVENT_TYPES.PASSWORD_RESET_COMPLETED,
    old_value: wasActivation ? { account_status: "INVITED" } : null,
    new_value: wasActivation ? { account_status: "ACTIVE" } : null,
    note: wasActivation
      ? "First activation completed via emailed link."
      : "Password reset completed.",
  });

  return {
    ok: true,
    account_status: wasActivation ? "ACTIVE" : profile?.account_status ?? "ACTIVE",
    was_activation: wasActivation,
  };
}
