"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NcrList } from "@/components/qaqc/ncr-list";

interface Project {
  id: string;
  project_name: string;
  project_code: string | null;
}

export default function NcrsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
    supabase
      .from("projects")
      .select("id, project_name, project_code")
      .order("project_name")
      .then(({ data }) => {
        if (data) {
          setProjects(data as Project[]);
          if (data.length > 0) setProjectId(data[0].id);
        }
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Non-Conformance Reports</h1>
              <p className="text-sm text-muted-foreground">NCR register — raise, track, and close non-conformances</p>
            </div>
          </div>
          <Select value={projectId} onValueChange={(v) => { if (v) setProjectId(v); }}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.project_code ? `[${p.project_code}] ` : ""}{p.project_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {projectId
          ? <NcrList projectId={projectId} pendingIrId={null} onClearPending={() => {}} />
          : <div className="flex items-center justify-center py-20 text-sm text-slate-400">Select a project.</div>
        }
      </div>
    </div>
  );
}
