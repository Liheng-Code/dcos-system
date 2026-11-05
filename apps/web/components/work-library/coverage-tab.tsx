"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listDivisionCoverage, type Division } from "@/lib/work-library/work-library-service";
import { COVERAGE_COLUMNS, coverageBand, coveragePct, totalCoverage, type CoverageBand, type DivisionCoverage } from "@/lib/work-library/coverage-rules";
import { errorMessage } from "./work-library-shared";

const BAND_CLS: Record<CoverageBand, string> = {
  full: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  good: "bg-lime-50 text-lime-800 dark:bg-lime-950/40 dark:text-lime-300",
  low: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  none: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  na: "text-muted-foreground",
};

function Cell({ part, base }: { part: number; base: number }) {
  const pct = coveragePct(part, base);
  return (
    <td className={cn("whitespace-nowrap px-3 py-1.5 text-right tabular-nums", BAND_CLS[coverageBand(pct)])} title={`${part} of ${base}`}>
      {pct === null ? "-" : `${pct}%`}
    </td>
  );
}

/** Coverage tab: how much library knowledge each CSI division's current activities carry. A row opens that division. */
export function CoverageTab({ db, divisions, refreshKey, onOpenDivision }: {
  db: SupabaseClient; divisions: Division[]; refreshKey: number; onOpenDivision: (code: string) => void;
}) {
  const [state, setState] = useState<{ key: number; rows: DivisionCoverage[]; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    listDivisionCoverage(db)
      .then((rows) => { if (live) setState({ key: refreshKey, rows, error: null }); })
      .catch((e) => { if (live) setState({ key: refreshKey, rows: [], error: errorMessage(e, "Failed to load coverage") }); });
    return () => { live = false; };
  }, [db, refreshKey, retry]);

  if (!state || state.key !== refreshKey) return <div className="space-y-1">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (state.error) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border p-8 text-center text-sm">
        <p className="text-destructive">{state.error}</p>
        <Button size="sm" variant="outline" onClick={() => { setState(null); setRetry((n) => n + 1); }}>Retry</Button>
      </div>
    );
  }
  const name = (c: string | null) => (c ? divisions.find((d) => d.code === c)?.name ?? "" : "No division");
  const total = totalCoverage(state.rows);
  const line = (r: DivisionCoverage, isTotal = false) => (
    <tr
      key={r.division_code ?? (isTotal ? "total" : "none")}
      className={cn("border-b border-border/60", isTotal ? "bg-muted/50 font-semibold" : "cursor-pointer hover:bg-muted/40")}
      onClick={isTotal || !r.division_code ? undefined : () => onOpenDivision(r.division_code!)}
    >
      <td className="whitespace-nowrap px-3 py-1.5">{isTotal ? "All divisions" : <><span className="font-mono text-xs text-muted-foreground">{r.division_code ?? "-"}</span> {name(r.division_code)}</>}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{r.activities}</td>
      {COVERAGE_COLUMNS.map((c) => <Cell key={c.key} part={Number(r[c.part])} base={Number(r[c.base])} />)}
    </tr>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Share of each division&apos;s current activities that carry each kind of library knowledge. Norms count only for quantity-based activities and
        packages only for work that is not self-performed. Select a division to open its activities.
      </p>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">CSI division</th><th className="px-3 py-2 text-right">Activities</th>
              {COVERAGE_COLUMNS.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 text-right" title={c.hint}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.rows.map((r) => line(r))}
            {line(total, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
