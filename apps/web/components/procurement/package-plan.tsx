"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getPackagePlan, type PackagePlanRow } from "@/lib/procurement/package-plan-service";
import { COVERAGE_LABEL, packageUrgency, URGENCY_LABEL, urgencyCounts, type PackageUrgency } from "@/lib/procurement/package-plan-rules";

const URGENCY_CLS: Record<PackageUrgency, string> = {
  overdue: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  due_soon: "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  planned: "border-border text-muted-foreground",
  covered: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Package Plan of the selected project: the procurement packages its unfinished tasks need (through their Work
 * Library activities), with required-on-site and order-by dates and PR coverage. "Long-lead only" is the long-lead register.
 */
export function PackagePlan() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId, selectedProject } = useProject();
  const [state, setState] = useState<{ key: string; rows: PackagePlanRow[]; error: string | null } | null>(null);
  const [longLeadOnly, setLongLeadOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(true);
  const [urgency, setUrgency] = useState<PackageUrgency | null>(null);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    getPackagePlan(db, selectedProjectId)
      .then((rows) => { if (live) setState({ key: selectedProjectId, rows, error: null }); })
      .catch((e) => { if (live) setState({ key: selectedProjectId, rows: [], error: e instanceof Error ? e.message : "Failed to load the package plan" }); });
    return () => { live = false; };
  }, [db, selectedProjectId]);

  const now = today();
  const loaded = state?.key === selectedProjectId ? state : null;
  const all = loaded?.rows ?? [];
  const counts = urgencyCounts(all, now);
  const rows = all.filter((r) => {
    const u = packageUrgency(r, now);
    return (!longLeadOnly || r.is_long_lead) && (!openOnly || u !== "covered") && (!urgency || u === urgency);
  });

  async function exportRows() {
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => ({
        Package: r.package_code, Name: r.package_name, Type: r.package_type, Trade: r.trade_category ?? "", "Long lead": r.is_long_lead ? "Y" : "",
        "Lead time (days)": r.lead_time_days, "Lead time from": r.lead_time_source === "package" ? "Package" : "Default",
        "First task": [r.first_task_code, r.first_task_name].filter(Boolean).join(" "), "First start": r.first_start,
        "Required on site": r.required_on_site, "Order by": r.order_by, Status: URGENCY_LABEL[packageUrgency(r, now)],
        Tasks: r.task_count, Activities: r.activity_count, PRs: r.pr_numbers ?? "", "PR required date": r.pr_required_date ?? "", Coverage: COVERAGE_LABEL[r.coverage],
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, longLeadOnly ? "Long-lead register" : "Package plan");
      XLSX.writeFile(wb, `${selectedProject?.project_code ?? "project"}-${longLeadOnly ? "long-lead-register" : "package-plan"}.xlsx`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not export"); }
  }

  if (!selectedProjectId) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Select a project to see its package plan.</p>;
  }

  const chip = (u: PackageUrgency, n: number) => (
    <button
      key={u} type="button" aria-pressed={urgency === u} onClick={() => setUrgency(urgency === u ? null : u)}
      className={cn("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs", urgency === u ? "border-primary bg-primary text-primary-foreground" : URGENCY_CLS[u])}
    >
      {URGENCY_LABEL[u]} <span className="tabular-nums">{n}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Packages the programme still needs, from the Work Library activities of unfinished tasks. Required on site = first task start minus the
        site buffer; order by = that minus the package lead time (Planning &gt; Outbound Feeds settings hold the buffer and default lead time).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {chip("overdue", counts.overdue)}{chip("due_soon", counts.due_soon)}{chip("planned", counts.planned)}{chip("covered", counts.covered)}
        <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="h-3.5 w-3.5" checked={longLeadOnly} onChange={(e) => setLongLeadOnly(e.target.checked)} /> Long-lead only ({counts.long_lead})
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="h-3.5 w-3.5" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Hide covered
        </label>
        <Button size="sm" variant="outline" className="ml-auto" disabled={!rows.length} onClick={() => void exportRows()}>
          <Download className="mr-1 h-4 w-4" /> Export
        </Button>
      </div>

      {!loaded ? (
        <div className="space-y-1">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : loaded.error ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-destructive">{loaded.error}</p>
      ) : all.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No packages: no unfinished task of this project is linked to a Work Library activity with a procurement package.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No packages match these filters.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border [&_th]:whitespace-nowrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead><TableHead>Trade</TableHead><TableHead className="text-right">Lead (days)</TableHead><TableHead>First task</TableHead>
                <TableHead>Required on site</TableHead><TableHead>Order by</TableHead><TableHead className="text-right">Tasks</TableHead><TableHead>PR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const u = packageUrgency(r, now);
                return (
                  <TableRow key={r.package_id}>
                    <TableCell>
                      <div className="font-mono text-xs text-muted-foreground">{r.package_code}</div>
                      <div className="flex items-center gap-1.5">{r.package_name}{r.is_long_lead && <Badge variant="outline">Long lead</Badge>}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.trade_category ?? "-"}<div className="text-xs capitalize text-muted-foreground">{r.package_type}</div></TableCell>
                    <TableCell className="text-right tabular-nums" title={r.lead_time_source === "package" ? "Package lead time" : "Default lead time (package has none)"}>
                      {r.lead_time_days}{r.lead_time_source === "default" && <span className="text-muted-foreground">*</span>}
                    </TableCell>
                    <TableCell className="max-w-64 text-sm"><span className="font-mono text-xs text-muted-foreground">{r.first_task_code}</span> <span className="truncate">{r.first_task_name}</span><div className="text-xs text-muted-foreground">starts {r.first_start}</div></TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{r.required_on_site}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="tabular-nums">{r.order_by}</span>
                      <span className={cn("ml-2 rounded-full border px-2 py-0.5 text-[11px]", URGENCY_CLS[u])}>{URGENCY_LABEL[u]}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.task_count}</TableCell>
                    <TableCell className="text-sm">
                      {r.pr_numbers ? (
                        <><div>{r.pr_numbers}</div><div className={cn("text-xs", r.coverage === "pr_late" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{COVERAGE_LABEL[r.coverage]}{r.pr_required_date ? `, needed ${r.pr_required_date}` : ""}</div></>
                      ) : (
                        <Link href="/dashboard/procurement/pr/new" className="text-primary underline-offset-2 hover:underline">Raise PR</Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {loaded && !loaded.error && all.some((r) => r.lead_time_source === "default") && (
        <p className="text-xs text-muted-foreground">* Default lead time: the package has none in the Work Library.</p>
      )}
    </div>
  );
}
