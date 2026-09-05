"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/auth-card";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});
type FormValues = z.infer<typeof forgotPasswordSchema>;

// USR-08 — Forgot Password (F6, BR6.01). Always shows the identical generic confirmation
// regardless of match, on both success AND request failure — no loading-state or
// error-state difference that could leak account existence.
export default function ForgotPasswordPage() {
  const { requestPasswordReset, loading } = useSupabaseAuth();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: FormValues) {
    try {
      await requestPasswordReset(values.email);
    } catch {
      // Intentionally swallowed — BR6.01 forbids a distinguishable error/timing signal here.
    } finally {
      setSubmitted(true);
    }
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
    >
      {submitted ? (
        <div className="rounded-lg border border-border bg-background p-4 text-center text-sm">
          If an account exists for this email, a password reset link has been sent.
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Reset Link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link href="/" className="underline hover:text-foreground transition-colors">
          Back to login
        </Link>
      </p>
    </AuthCard>
  );
}
