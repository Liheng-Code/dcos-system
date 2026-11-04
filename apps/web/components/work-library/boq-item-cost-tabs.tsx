"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listWorkItemBoqUses, listWorkItemBreakdown, type BoqUse, type CostBreakdownLine } from "@/lib/work-library/work-library-service";
import { rateText } from "@/lib/work-library/boq-item-rules";
import { COST_LIBRARY_HREF, errorMessage } from "./work-library-shared";

const CATEGORY_LABEL: Record<string, string> = { labor: "Labour", material: "Material", equipment: "Equipment", subcon: "Subcontract" };

/** Loads once per work item; error and empty states shared by both tabs. */
function useLoad<T>(load: () => Promise<T[]>, key: string) {
  const [state, setState] = useState<{ key: string; rows: T[]; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    load().then((rows) => { if (live) setState({ key, rows, error: null }); })
      .catch((e) => { if (live) setState({ key, rows: [], error: errorMessage(e, "Failed to load") }); });
    return () => { live = false; };
  }, [load, key]);
  return state?.key === key ? state : null;
}

/** Cost build-up tab: the work item's resource lines at current prices, with a subtotal per category. Read-only (edited in QS). */
export function BoqItemCostTab({ db, workItemId }: { db: SupabaseClient; workItemId: string }) {
  const [load] = useState(() => () => listWorkItemBreakdown(db, workItemId));
  const s = useLoad<CostBreakdownLine>(load, workItemId);
  if (!s) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (s.error) return <p className="text-sm text-destructive">{s.error}</p>;

  const byCat = new Map<string, number>();
  for (const l of s.rows) byCat.set(l.category, (byCat.get(l.category) ?? 0) + (l.lineCost ?? 0));
  const missing = s.rows.some((l) => l.lineCost === null);
  const total = [...byCat.values()].reduce((a, n) => a + n, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {[...byCat].map(([cat, v]) => (
            <span key={cat} className="rounded-md border border-border px-2.5 py-1 text-xs">
              {CATEGORY_LABEL[cat] ?? cat} <span className="font-semibold tabular-nums">{rateText(v)}</span>
            </span>
          ))}
          <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Net rate {missing ? "incomplete" : rateText(total)}</span>
        </div>
        <Button size="sm" variant="outline" render={<Link href={COST_LIBRARY_HREF} />}>Edit build-up in QS</Button>
      </div>
      {s.rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No build-up lines yet. Add them in the QS cost library.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border [&_th]:whitespace-nowrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead><TableHead>Resource</TableHead><TableHead>Unit</TableHead>
                <TableHead className="text-right">Consumption</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Line cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.rows.map((l, i) => (
                <TableRow key={`${l.resourceCode}-${i}`}>
                  <TableCell><Badge variant="secondary">{CATEGORY_LABEL[l.category] ?? l.category}</Badge></TableCell>
                  <TableCell><span className="mr-1.5 font-mono text-xs text-muted-foreground">{l.resourceCode}</span>{l.resourceName}</TableCell>
                  <TableCell>{l.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.consumption}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {l.unitPrice === null ? <span className="text-amber-600">No price</span> : rateText(l.unitPrice)}
                    {l.expired && <Badge variant="outline" className="ml-1.5">Expired</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rateText(l.lineCost)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 hover:bg-muted/40"><TableCell colSpan={5} className="text-right font-medium">Net direct rate</TableCell><TableCell className="text-right font-semibold tabular-nums">{missing ? "-" : rateText(total)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Used in tab: project and tender BOQ lines that reference the work item (only those the viewer can read). */
export function BoqItemUsedInTab({ db, workItemId }: { db: SupabaseClient; workItemId: string }) {
  const [load] = useState(() => () => listWorkItemBoqUses(db, workItemId));
  const s = useLoad<BoqUse>(load, workItemId);
  if (!s) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (s.error) return <p className="text-sm text-destructive">{s.error}</p>;
  if (s.rows.length === 0) {
    return <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No project or tender BOQ line you can see uses this item.</p>;
  }
  return (
    <div className="overflow-auto rounded-lg border border-border [&_th]:whitespace-nowrap">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Source</TableHead><TableHead>Project / tender</TableHead><TableHead>Item</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Quantity</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {s.rows.map((u, i) => (
            <TableRow key={i}>
              <TableCell><Badge variant={u.source === "project" ? "default" : "secondary"}>{u.source === "project" ? "Project BOQ" : "Tender BOQ"}</Badge></TableCell>
              <TableCell className="text-sm">{u.owner}</TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs">{u.itemNo || "-"}</TableCell>
              <TableCell>{u.description}</TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">{u.quantity ?? "-"} {u.unit ?? ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
