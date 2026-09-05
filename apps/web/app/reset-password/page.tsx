"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/landing/password-input";

type Stage = "checking" | "ready" | "invalid" | "done";

// Mirrors apps/web/lib/auth/password-policy.ts's passwordPolicySchema exactly (BR5.02).
const POLICY_RULES: { key: string; label: string; test: (pw: string) => boolean }[] = [
  { key: "len", label: "At least 12 characters", test: (pw) => pw.length >= 12 },
  { key: "lower", label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "upper", label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "num", label: "One number", test: (pw) => /[0-9]/.test(pw) },
  { key: "special", label: "One special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

/**
 * USR-09 — Reset / Activate Password (F2/F6 shared completion page).
 *
 * Critical wiring (see final report): apps/web/lib/auth/auth-service.ts's resetPassword()
 * calls userClient.auth.getUser() and expects an already-established Supabase recovery
 * session. This page's job is to let the browser's Supabase client (apps/web/lib/supabase/
 * client.ts, cookie-backed via @supabase/ssr) process the emailed link BEFORE calling
 * POST /api/auth/reset-password: creating the client on mount auto-triggers its
 * _initialize(), which detects either an implicit-style hash-fragment token
 * (#access_token=...&type=recovery|invite) or a PKCE ?code= param, saves the session (which
 * @supabase/ssr persists into cookies the server can read), and fires PASSWORD_RECOVERY
 * (recovery links) or SIGNED_IN (invite links — inviteUserByEmail never uses PKCE and lands
 * the same way). We listen for both, plus a getSession() fallback in case the event fired
 * before this component subscribed.
 *
 * This same page serves BOTH first-activation (invite links) and routine password reset
 * (recovery links) — Supabase's invite-link and recovery-link flows both land the user in
 * this same "set your password" state (08-API-Reference.md).
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { confirmPasswordReset, loading } = useSupabaseAuth();
  const [stage, setStage] = useState<Stage>("checking");
  const [variant, setVariant] = useState<"activation" | "reset">("reset");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Read `type`/error params directly (independent of the SDK's own parsing/clearing of
    // window.location.hash) so the activation-vs-reset copy variant is available even if the
    // SDK has already consumed and stripped the hash by the time we check.
    const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);
    const search = new URLSearchParams(window.location.search);
    const type = hashParams.get("type") ?? search.get("type");
    // Reading a one-shot URL param on mount to pick a copy variant, not synchronizing state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (type === "invite" || type === "signup") setVariant("activation");

    const errDesc =
      hashParams.get("error_description") ?? search.get("error_description") ?? hashParams.get("error") ?? search.get("error");
    if (errDesc) {
      setInvalidReason(decodeURIComponent(errDesc.replace(/\+/g, " ")));
      setStage("invalid");
      return;
    }

    const hasTokenMaterial = !!(hashParams.get("access_token") || search.get("code") || search.get("token_hash"));

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStage((s) => (s === "done" ? s : "ready"));
      }
    });

    // Fallback in case the event already fired before this listener attached.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStage((s) => (s === "done" ? s : "ready"));
      } else if (!hasTokenMaterial) {
        setStage("invalid");
      }
    });

    const timeout = setTimeout(() => {
      setStage((s) => (s === "checking" ? "invalid" : s));
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const failedRules = useMemo(() => POLICY_RULES.filter((r) => !r.test(password)), [password]);
  const passwordsMatch = password.length > 0 && password === confirmPw;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (failedRules.length > 0) {
      setSubmitError("Password does not meet the policy requirements below.");
      return;
    }
    if (!passwordsMatch) {
      setSubmitError("Passwords do not match.");
      return;
    }
    try {
      const result = await confirmPasswordReset(password);
      setStage("done");
      toast.success(result.was_activation ? "Account activated." : "Password reset successfully.");
      // The recovery session established above (userClient.auth.getUser() in
      // resetPassword()) IS the user's real session at this point — Supabase recovery
      // sessions are full sessions, not a separate exchange step — so they're effectively
      // already signed in. Judgment call on the doc's "[TBD — auto-sign-in vs. redirect to
      // login]": auto-sign-in into /dashboard, since a second login prompt right after
      // setting a password (which the user just proved they control) adds friction without
      // adding security, and matches what the session state already allows.
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to reset password");
    }
  }

  if (stage === "checking") {
    return (
      <AuthCard title="Verifying your link…" subtitle="This will only take a moment.">
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthCard>
    );
  }

  if (stage === "invalid") {
    return (
      <AuthCard title="Link expired" subtitle="This link has expired or already been used.">
        <div className="rounded-lg border border-border bg-background p-4 text-center text-sm text-muted-foreground">
          {invalidReason ?? "Request a new link to continue."}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/forgot-password" className="text-primary underline hover:no-underline">
            Request a new link
          </Link>
        </p>
      </AuthCard>
    );
  }

  if (stage === "done") {
    return (
      <AuthCard
        title={variant === "activation" ? "Account activated" : "Password reset"}
        subtitle="Redirecting you now…"
      >
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={variant === "activation" ? "Welcome to DCOS" : "Reset your password"}
      subtitle={
        variant === "activation"
          ? "Set your password to activate your account."
          : "Set a new password for your account."
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <PasswordInput id="confirm" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          {confirmPw.length > 0 && !passwordsMatch && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}
        </div>
        <ul className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
          {POLICY_RULES.map((rule) => {
            const ok = rule.test(password);
            return (
              <li
                key={rule.key}
                className={cn("flex items-center gap-1.5 text-xs", ok ? "text-emerald-600" : "text-muted-foreground")}
              >
                {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                {rule.label}
              </li>
            );
          })}
        </ul>
        {submitError && <p className="text-xs text-destructive">{submitError}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {variant === "activation" ? "Activate Account" : "Reset Password"}
        </Button>
      </form>
    </AuthCard>
  );
}
