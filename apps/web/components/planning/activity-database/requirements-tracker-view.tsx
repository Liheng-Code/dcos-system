"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  REQUIREMENT_KIND_LABEL, REQUIREMENT_STATE_LABEL, stateCounts, type RequirementKind, type RequirementState,
} from "@/lib/planning/activity-library/requirement-status";
import { listProjectRequirements, type Requirement } from "@/lib/planning/activity-library/requirement-status-service";
import { errorMessage } from "./activity-database-shared";

const STATE_CLS: Record<RequirementState, string> = {
  missing: "border-red-200 bg-red-50 text-red-700",
  resubmit: "border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700",
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/** Where each kind of requirement is fulfilled. */
const FULFIL: Record<RequirementKind, { label: string; href: string }> = {
  shop_drawing: { label: "Submittals", href: "/dashboard/documents/submittals" },
  method_statement: { label: "Submittals", href: "/dashboard/documents/submittals" },
  tc: { label: "QA/QC ITPs", href: "/dashboard/qaqc?sub=itps" },
  coordination: { label: "Coordination Log", href: "/dashboard/design/coordination" },
};

const KIND_FILTERS: (RequirementKind | "all")[] = ["all", "shop_drawing", "method_statement", "tc", "coordination"];
const STATES: RequirementState[] = ["missing", "resubmit", "in_progress", "done"];

/**
 * Requirements Tracker: the shop drawings, method statements and T&C items the selected project's activities need
 * (Activity Database), against the submittals and ITP lines that name them.
 */
export function RequirementsTrackerView() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [tick, setTick] = useState(0);
  const [kind, setKind] = useState<RequirementKind | "all">("all");
  const [state, setState] = useState<RequirementState | "all">("all");
  const key = `${selectedProjectId}|${tick}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: Requirement[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    listProjectRequirements(db, selectedProjectId)
      .then((rows) => { if (live) setLoaded({ key, rows, error: null }); })
      .catch((e) => { if (live) setLoaded({ key, rows: [], error: errorMessage(e, "Failed to load requirements") }); });
    return () => { live = false; };
  }, [db, selectedProjectId, key]);

  const current = loaded?.key === key ? loaded : null;
  const ofKind = useMemo(() => (current?.rows ?? []).filter((r) => kind === "all" || r.kind === kind), [current, kind]);
  const counts = useMemo(() => stateCounts(ofKind.map((r) => r.state)), [ofKind]);
  const rows = useMemo(() => ofKind.filter((r) => state === "all" || r.state === state), [ofKind, state]);

  if (projectLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (!selectedProjectId) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Select a project to see what its activities require.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((k) => (
            <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
              {k === "all" ? "All" : REQUIREMENT_KIND_LABEL[k]}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setTick((n) => n + 1)}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
      </div>

      {current && !current.error && current.rows.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-4">
          {STATES.map((s) => (
            <button
              key={s} type="button" onClick={() => setState(state === s ? "all" : s)} aria-pressed={state === s}
              className={cn("rounded-lg border p-3 text-left transition-colors", STATE_CLS[s], state === s ? "ring-2 ring-primary/40" : "hover:opacity-90")}
            >
              <div className="text-2xl font-semibold tabular-nums">{counts[s]}</div>
              <div className="text-xs">{REQUIREMENT_STATE_LABEL[s]}</div>
            </button>
          ))}
        </div>
      )}

      {!current ? (
        <div className="space-y-1">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : current.error ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-8 text-center text-sm">
          <p className="text-destructive">{current.error}</p>
          <Button size="sm" variant="outline" onClick={() => setTick((n) => n + 1)}>Retry</Button>
        </div>
      ) : current.rows.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p>No activity of this project is linked to a shop drawing type, method statement, T&amp;C item or coordination item yet.</p>
          <p>
            Link them in the <Link href="/dashboard/planning/activity-database" className="text-primary underline-offset-2 hover:underline">Activity Database</Link>
            {" "}(open an activity, Details tab). Project tasks generated from those activities then show here.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No requirements match this filter.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead><TableHead>Code</TableHead><TableHead>Requirement</TableHead><TableHead>Needed by</TableHead>
                <TableHead>Records</TableHead><TableHead>Status</TableHead><TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.kind}:${r.item.id}`}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{REQUIREMENT_KIND_LABEL[r.kind]}</TableCell>
                  <TableCell className="font-mono text-xs">{r.item.code}</TableCell>
                  <TableCell>{r.item.name}</TableCell>
                  <TableCell className="max-w-64 text-xs text-muted-foreground" title={r.tasks.map((t) => t.task_name).join("\n")}>
                    <span className="font-medium text-foreground">{r.tasks.length} task{r.tasks.length === 1 ? "" : "s"}</span>
                    <span className="block truncate">{r.tasks.slice(0, 3).map((t) => t.task_name).join(", ")}{r.tasks.length > 3 ? ` +${r.tasks.length - 3}` : ""}</span>
                  </TableCell>
                  <TableCell className="max-w-72 text-xs">
                    {r.records.length === 0 ? <span className="text-muted-foreground">None</span> : (
                      <ul className="space-y-0.5">
                        {r.records.slice(0, 3).map((rec) => (
                          <li key={rec.id} className="truncate" title={rec.label}>
                            <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", rec.state === "done" ? "bg-emerald-500" : rec.state === "resubmit" ? "bg-amber-500" : "bg-blue-500")} />
                            {rec.label}
                          </li>
                        ))}
                        {r.records.length > 3 && <li className="text-muted-foreground">+{r.records.length - 3} more</li>}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={STATE_CLS[r.state]}>{REQUIREMENT_STATE_LABEL[r.state]}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Link href={FULFIL[r.kind].href} className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
                      {FULFIL[r.kind].label} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        A requirement counts as done when a linked submittal is approved (Code A or B), its ITP is closed, its MEP commissioning
        test has passed or its coordination log entry is resolved. Records are matched
        project-wide by the catalogue item they name, not by WBS location.
      </p>
    </div>
  );
}
