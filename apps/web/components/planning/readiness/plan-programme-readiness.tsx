"use client";

// Planning > Overview: programme readiness checklist (doc 35 U1; PRD doc 34 §6.1 guided mode). The 11 guided steps
// for the selected project with their live status, each linking to the page where the step is done. Not a wizard:
// the steps are ordinary pages and can be done in any order.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { nextStep, type ReadinessStep, type StepStatus } from "@/lib/planning/readiness/programme-readiness";
import { loadProgrammeReadiness } from "@/lib/planning/readiness/readiness-service";

const STATUS: Record<StepStatus, { icon: typeof Circle; cls: string; label: string }> = {
  done: { icon: CheckCircle2, cls: "text-emerald-600", label: "Done" },
  attention: { icon: AlertTriangle, cls: "text-amber-600", label: "Needs attention" },
  waiting: { icon: Clock, cls: "text-sky-600", label: "Waiting for approval" },
  todo: { icon: Circle, cls: "text-muted-foreground", label: "To do" },
};

export function PlanProgrammeReadiness() {
  const { selectedProjectId: projectId } = useProject();
  const db = useMemo(() => createClient(), []);
  const [loaded, setLoaded] = useState<{ projectId: string; steps: ReadinessStep[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    loadProgrammeReadiness(db, projectId)
      .then((s) => { if (!cancelled) { setLoaded({ projectId, steps: s }); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [db, projectId, tick]);

  if (!projectId) return null;
  const steps = loaded?.projectId === projectId ? loaded.steps : null;
  if (error) return <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Programme readiness is not available: {error}</p>;
  if (!steps) return <div className="flex justify-center rounded-lg border border-border py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const done = steps.filter((s) => s.status === "done").length;
  const next = nextStep(steps);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Programme readiness</h2>
          <p className="text-xs text-muted-foreground">
            The steps to a submitted programme for this project, with their live status. Open a step to work on it.
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">{done} of {steps.length} done</span>
        <button type="button" title="Refresh" onClick={() => setTick((t) => t + 1)} className="text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-emerald-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="divide-y divide-border">
        {steps.map((s) => {
          const st = STATUS[s.status];
          const isNext = next?.key === s.key;
          return (
            <li key={s.key} className={cn("flex items-center gap-3 py-2", isNext && "-mx-2 rounded-lg bg-primary/5 px-2")}>
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{s.n}</span>
              <st.icon className={cn("h-4 w-4 shrink-0", st.cls)} aria-label={st.label} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.title}
                  {isNext && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">Next</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={s.detail}>{s.detail}</p>
              </div>
              <Link href={s.href} className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                {s.action} <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
