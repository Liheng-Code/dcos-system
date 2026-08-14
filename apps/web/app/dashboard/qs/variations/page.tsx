"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GitBranch, Loader2 } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { MergedVariationsView } from "@/components/qs/merged-variations-view";

export default function VariationsPage() {
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
            <GitBranch className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Variations</h1>
            <p className="text-sm text-muted-foreground">Main contract and subcontractor variations</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {projectId
          ? <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><MergedVariationsView projectId={projectId} projectName={projectName} /></Suspense>
          : <div className="flex items-center justify-center py-20 text-sm text-slate-400">Select a project from the top bar.</div>}
      </div>
    </div>
  );
}
