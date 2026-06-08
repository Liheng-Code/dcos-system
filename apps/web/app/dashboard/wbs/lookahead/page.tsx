"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { WbsLookaheadView } from "@/components/wbs/wbs-lookahead-view";
import { WbsWeeklyPlan } from "@/components/wbs/wbs-weekly-plan";
import { WbsScurveChart } from "@/components/wbs/wbs-scurve-chart";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "lookahead", label: "Look-ahead" },
  { id: "weekly",    label: "Weekly Plans" },
  { id: "scurve",    label: "S-Curve & EVM" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function LookaheadPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("lookahead");

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
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 pt-4">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "lookahead" && <WbsLookaheadView />}

        {tab === "weekly" && (
          <div className="p-6"><WbsWeeklyPlan /></div>
        )}

        {tab === "scurve" && <WbsScurveChart />}
      </div>
    </div>
  );
}
