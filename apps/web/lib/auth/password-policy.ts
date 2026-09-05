import { z } from "zod";

/**
 * Shared password policy (BR5.02): minimum 12 characters, at least one uppercase, one
 * lowercase, one number, one special character. Matches SOP §15's "12 characters
 * recommended" language, superseding the SOP's older minimum-8 text.
 *
 * Reused by `/api/auth/change-password`, `/api/auth/reset-password`, and (documented for)
 * the activation flow — activation and reset share the same endpoint (BR2.01).
 */
export const passwordPolicySchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

/**
 * Returns the list of human-readable policy rules a candidate password fails, for the
 * `400 USR_PASSWORD_POLICY` error body ("body includes which rule(s) failed" per
 * `08-API-Reference.md`). Returns an empty array if the password satisfies the policy.
 */
export function describePasswordPolicyFailures(password: string): string[] {
  const failures: string[] = [];
  if (password.length < 12) failures.push("At least 12 characters");
  if (!/[a-z]/.test(password)) failures.push("At least one lowercase letter");
  if (!/[A-Z]/.test(password)) failures.push("At least one uppercase letter");
  if (!/[0-9]/.test(password)) failures.push("At least one number");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("At least one special character");
  return failures;
}
