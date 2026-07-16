"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BarChart2, Loader2 } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { CostControl } from "@/components/qs/cost-control";

export default function CostControlPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const { selectedProjectId: projectId, selectedProject } = useProject();
  const projectName = selectedProject?.project_name ?? projectId;

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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
            <BarChart2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Cost Control</h1>
            <p className="text-sm text-muted-foreground">Budget vs actual, revisions, and cost transactions</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {!projectId ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">Select a project to view cost control data.</div>
        ) : (
          <CostControl projectId={projectId} projectName={projectName} />
        )}
      </div>
    </div>
  );
}
