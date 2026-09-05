"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useSupabaseAuth() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signUp = useCallback(
    async (fullName: string, email: string, password: string) => {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      setLoading(false);

      if (error) throw error;
      router.push("/modules");
    },
    [router],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setLoading(false);

      if (error) throw error;
      router.push("/modules");
    },
    [router],
  );

  const signOut = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setLoading(false);
    router.push("/");
  }, [router]);

  /**
   * F5 — self-service password change. Requires an active session (cookie-based, handled
   * server-side by /api/auth/change-password). Does not navigate — the caller decides what to
   * do with the result (this hook stays UI-agnostic; Phase 4 owns the actual form/toast).
   */
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to change password");
      return data as { ok: true; message: string };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * F6 — unauthenticated "forgot password" request. Always resolves successfully (the backend
   * is deliberately email-enumeration-safe — BR6.01) regardless of whether the email matches an
   * account.
   */
  const requestPasswordReset = useCallback(async (email: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to request password reset");
      return data as { ok: true; message: string };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * F2/F6 — completes a password reset/activation. Must be called only after the Supabase
   * recovery token from the emailed link has already been exchanged for a session client-side
   * (the /reset-password page Phase 4 builds is responsible for that handoff before calling
   * this).
   */
  const confirmPasswordReset = useCallback(async (newPassword: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to reset password");
      return data as { ok: true; account_status: string; was_activation: boolean };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    signUp,
    signIn,
    signOut,
    changePassword,
    requestPasswordReset,
    confirmPasswordReset,
    loading,
  };
}
