"use client";

// What a report on this screen is based on (doc 35 M3): data date, baseline reference, programme revision and the
// calculation the dates came from. Shown above the on-screen reports; the same lines head every generated report.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { basisLines, type ReportBasis } from "@/lib/planning/reports/report-model";
import { getReportBasis } from "@/lib/planning/reports/report-snapshots-service";

export function ReportBasisStrip({ projectId, className }: { projectId: string | null; className?: string }) {
  const db = useMemo(() => createClient(), []);
  const [loaded, setLoaded] = useState<{ projectId: string; basis: ReportBasis } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    getReportBasis(db, projectId).then((basis) => { if (live) setLoaded({ projectId, basis }); }).catch(() => { /* optional strip */ });
    return () => { live = false; };
  }, [db, projectId]);
  if (!projectId || loaded?.projectId !== projectId) return null;
  const lines = basisLines(loaded.basis, new Date().toISOString().slice(0, 10));
  return (
    <div className={cn("flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs", className)}>
      {lines.map((l) => (
        <span key={l.label} className="flex items-center gap-1">
          <span className="text-muted-foreground">{l.label}:</span>
          <span className={cn("font-medium", l.warn && "text-amber-600")}>{l.value}</span>
          {l.warn && <AlertTriangle className="h-3 w-3 text-amber-600" />}
        </span>
      ))}
    </div>
  );
}
