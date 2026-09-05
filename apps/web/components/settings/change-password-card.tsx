"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/landing/password-input";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";

// Mirrors apps/web/lib/auth/password-policy.ts's passwordPolicySchema (BR5.02) client-side.
const changePasswordFormSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z
      .string()
      .min(12, "Password must be at least 12 characters")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords must match",
    path: ["confirm_password"],
  });

type FormValues = z.infer<typeof changePasswordFormSchema>;

// USR-10 — Change Password (own profile). Hosted on the existing /dashboard/profile page
// (apps/web/app/dashboard/profile/page.tsx already exists as "My Profile" — this resolves
// Doc03's "[TBD] where does Change Password UI live").
export function ChangePasswordCard() {
  const { changePassword, loading } = useSupabaseAuth();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(changePasswordFormSchema) });

  async function onSubmit(values: FormValues) {
    try {
      const result = await changePassword(values.current_password, values.new_password);
      toast.success(result.message);
      reset();
    } catch (err) {
      // use-supabase-auth.ts's changePassword() only surfaces the server's human-readable
      // `error` message (not the `code`), so field-mapping here is done by matching the known
      // message text from apps/web/lib/auth/auth-service.ts's changePassword() rather than a
      // machine code — a reasonable non-invasive way to satisfy "server errors map to form
      // fields" without changing the Phase 3 hook's return shape.
      const message = err instanceof Error ? err.message : "Failed to change password";
      if (/current password is incorrect/i.test(message)) {
        setError("current_password", { message });
      } else if (/password does not meet policy/i.test(message)) {
        setError("new_password", { message });
      } else {
        toast.error(message);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Change Password
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Changing your password signs you out of your other devices.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current_password">Current Password</Label>
            <PasswordInput id="current_password" {...register("current_password")} aria-invalid={!!errors.current_password} />
            {errors.current_password && <p className="text-xs text-destructive">{errors.current_password.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new_password">New Password</Label>
            <PasswordInput id="new_password" {...register("new_password")} aria-invalid={!!errors.new_password} />
            {errors.new_password && <p className="text-xs text-destructive">{errors.new_password.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Confirm New Password</Label>
            <PasswordInput id="confirm_password" {...register("confirm_password")} aria-invalid={!!errors.confirm_password} />
            {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password.message}</p>}
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Change Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
