"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { WbsLookaheadView } from "@/components/wbs/wbs-lookahead-view";
import { WbsWeeklyPlan } from "@/components/wbs/wbs-weekly-plan";
import { WbsScurveChart } from "@/components/wbs/wbs-scurve-chart";

const SUB_TAB_IDS = ["lookahead", "weekly", "scurve"] as const;
type SubTab = (typeof SUB_TAB_IDS)[number];

function LookaheadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as SubTab | null;
  const tab: SubTab = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "lookahead";

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push("/");
      else setChecking(false);
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {tab === "lookahead" && <WbsLookaheadView />}

      {tab === "weekly" && (
        <div className="p-6"><WbsWeeklyPlan /></div>
      )}

      {tab === "scurve" && <WbsScurveChart />}
    </div>
  );
}

export default function LookaheadPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <LookaheadPageContent />
    </Suspense>
  );
}
