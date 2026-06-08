"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ClipboardCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ItpManager } from "@/components/qaqc/itp-manager";
import { InspectionRequestList } from "@/components/qaqc/inspection-request-list";
import { NcrList } from "@/components/qaqc/ncr-list";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  project_name: string;
  project_code: string | null;
}

const TABS = [
  { id: "itps",        label: "Inspection & Test Plans" },
  { id: "inspections", label: "Inspection Requests" },
  { id: "ncrs",        label: "NCRs" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function QaqcPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<Tab>("itps");
  const [pendingNcrIrId, setPendingNcrIrId] = useState<string | null>(null);

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

  function handleRaiseNcr(irId: string) {
    setPendingNcrIrId(irId);
    setTab("ncrs");
  }

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">QA/QC</h1>
              <p className="text-sm text-muted-foreground">Inspection plans, requests, and non-conformances</p>
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

        {/* Tabs */}
        <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-1">
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
              {t.id === "ncrs" && pendingNcrIrId && (
                <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white">!</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!projectId ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            Select a project to view QA/QC data.
          </div>
        ) : (
          <>
            {tab === "itps" && <ItpManager projectId={projectId} />}
            {tab === "inspections" && (
              <InspectionRequestList projectId={projectId} onRaiseNcr={handleRaiseNcr} />
            )}
            {tab === "ncrs" && (
              <NcrList
                projectId={projectId}
                pendingIrId={pendingNcrIrId}
                onClearPending={() => setPendingNcrIrId(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
