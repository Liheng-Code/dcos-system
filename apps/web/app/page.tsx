"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LeftPanel } from "@/components/landing/left-panel";
import { RightPanel } from "@/components/landing/right-panel";
import { Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Use getUser() (server-validated) instead of getSession() (local cache only)
    // so a stale JWT from a restarted Supabase instance doesn't slip through.
    supabase.auth.getUser().then(({ data, error }) => {
      if (data.user && !error) {
        router.push("/modules");
      } else {
        // Clear any invalid session tokens before showing the login form
        supabase.auth.signOut().finally(() => setChecking(false));
      }
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen md:grid-cols-5">
      <LeftPanel />
      <RightPanel />
    </div>
  );
}
