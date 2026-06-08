"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TrendingUp } from "lucide-react";
import { ProfitLossView } from "@/components/account/profit-loss-view";

export default function ProfitLossPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);
  if (checking) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Profit & Loss</h1>
            <p className="text-sm text-muted-foreground">Income and expense summary</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6"><ProfitLossView /></div>
    </div>
  );
}
