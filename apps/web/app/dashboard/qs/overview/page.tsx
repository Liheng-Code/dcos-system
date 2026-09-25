"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QsOverviewInfographic } from "@/components/qs/qs-overview-infographic";

// Static explainer page — no project scoping, no data fetching. Renders
// instantly regardless of which project is selected. See qs-nav.ts (the
// "Overview" tab of the cost_control group) and the Planning module's
// equivalent (app/dashboard/planning/overview/page.tsx), which this mirrors.
export default function QsOverviewPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
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
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <Compass className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">QS Overview</h1>
            <p className="text-sm text-muted-foreground">
              How the module fits together — every capability, and how it connects to the others
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <QsOverviewInfographic />
      </div>
    </div>
  );
}
