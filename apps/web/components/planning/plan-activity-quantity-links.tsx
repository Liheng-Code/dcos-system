"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { deleteQuantityLink, listQuantityLinks, type QuantityLinkView } from "@/lib/planning/activity-library/boq-quantity-service";
import { EmptyNote } from "./plan-act-shared";

/** Every BOQ link the planners confirmed for this project: what feeds each level's quantity, and whether the BOQ moved since. */
export function PlanActivityQuantityLinks() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [rows, setRows] = useState<QuantityLinkView[] | null>(null);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    try { setRows(await listQuantityLinks(db, selectedProjectId)); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load links"); }
  }, [db, selectedProjectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  if (!selectedProjectId) return <div className="p-6"><EmptyNote>Select a project in the header.</EmptyNote></div>;
  if (!rows) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const drifted = rows.filter((r) => r.drifted || r.missing).length;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted-foreground">
          BOQ lines that supply quantities to generated activities. A generation reads the <b>current</b> BOQ quantity times the share, so a revised BOQ line changes the next run.
        </p>
        {drifted > 0 && <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-500">{drifted} link{drifted === 1 ? "" : "s"} changed since confirmed</span>}
      </div>
      {rows.length === 0 ? <EmptyNote>No BOQ links yet. Open a generation run and use “Find in BOQ” on an activity with a missing quantity.</EmptyNote> : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-3 py-2">Level</th><th className="px-3 py-2">Metric</th><th className="px-3 py-2">BOQ line</th>
              <th className="px-3 py-2">Share</th><th className="px-3 py-2">At link</th><th className="px-3 py-2">Now</th><th className="px-3 py-2">Gives</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-t border-border", (r.drifted || r.missing) && "bg-amber-500/10")}>
                <td className="px-3 py-1.5">{r.node_name}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.metric_code}</td>
                <td className="px-3 py-1.5">
                  <span className="font-mono text-xs text-primary">{r.boq_item_ref ?? "—"}</span> {r.boq_description}
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {r.boq_source === "qs_boq" ? "Project BOQ" : "Tender BOQ"}
                    {r.source === "bridge_rule" && <span className="ml-1.5 rounded bg-sky-100 px-1 font-semibold text-sky-700">Bridge</span>}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  {r.source === "bridge_rule" ? <>×{Math.round(r.factor * 1e6) / 1e6}</> : <>{Math.round(r.factor * 10000) / 100}%</>}
                </td>
                <td className="px-3 py-1.5">{r.quantity_at_link ?? "—"} {r.boq_unit}</td>
                <td className="px-3 py-1.5">{r.missing ? <span className="text-red-500">line not found</span> : <>{r.quantity_now} {r.boq_unit}{r.drifted && <span className="ml-1 text-xs font-semibold text-amber-500">changed</span>}</>}</td>
                <td className="px-3 py-1.5 font-semibold">{r.contribution ?? "—"} {r.contribution_unit}</td>
                <td className="px-3 py-1.5 text-right">
                  <Button size="icon" variant="ghost" aria-label="Remove link" onClick={async () => {
                    try { await deleteQuantityLink(db, r.id); toast.success("Link removed (activities already generated keep their quantity)"); await load(); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                  }}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
