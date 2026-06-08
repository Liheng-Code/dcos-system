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
      router.push("/dashboard");
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
      router.push("/dashboard");
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

  return { signUp, signIn, signOut, loading };
}
