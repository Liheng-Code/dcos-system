"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Briefcase, Loader2 } from "lucide-react";
import { PortfolioView } from "@/components/qs/portfolio-view";

export default function PortfolioPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  if (checking) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
            <Briefcase className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Portfolio View</h1>
            <p className="text-sm text-muted-foreground">Cross-project cost analytics and EVM</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <PortfolioView />
      </div>
    </div>
  );
}
