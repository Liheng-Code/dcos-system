import { z } from "zod";
import { passwordPolicySchema } from "./password-policy";

/** POST /api/auth/change-password (F5) */
export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "current_password is required"),
  new_password: passwordPolicySchema,
});

/** POST /api/auth/forgot-password (F6) */
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  /** Optional override for where the emailed recovery link lands (see redirectTo note). */
  redirect_to: z.string().url().optional(),
});

/** POST /api/auth/reset-password (F2/F6 shared completion endpoint) */
export const resetPasswordSchema = z.object({
  new_password: passwordPolicySchema,
});
