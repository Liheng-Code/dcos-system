"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Ruler } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildSegments, formatChainage, parseChainagePoint } from "@/lib/chainage";
import { addChainageSegments, listRouteSections, type ExistingSection } from "@/lib/project/wbs/chainage-queries";

export interface RouteRef { id: string; wbs_code: string; wbs_name: string; node_type: string }

const field = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

/**
 * Adds chainage sections (segment nodes with a chainage range) under a road / pipeline route, so linear
 * works can be generated and quantified per section (Activity Library › Generate, QS Bridge location map).
 */
export function ChainageSectionsDialog({ routes, initialRouteId, open, onOpenChange, onApplied }: {
  routes: RouteRef[];
  initialRouteId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const [routeId, setRouteId] = useState(initialRouteId ?? routes[0]?.id ?? "");
  const [existing, setExisting] = useState<ExistingSection[]>([]);
  const [start, setStart] = useState("0+000");
  const [end, setEnd] = useState("5+000");
  const [sectionLength, setSectionLength] = useState("1000");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !routeId) return;
    let cancelled = false;
    listRouteSections(routeId)
      .then((rows) => {
        if (cancelled) return;
        setExisting(rows);
        // carry on from the last section of the route
        if (rows.length > 0) {
          const last = rows[rows.length - 1].to;
          setStart(formatChainage(last));
          setEnd(formatChainage(last + 5000));
        }
      })
      .catch(() => { if (!cancelled) setExisting([]); });
    return () => { cancelled = true; };
  }, [open, routeId]);

  const from = parseChainagePoint(start);
  const to = parseChainagePoint(end);
  const step = Number(sectionLength);
  const error = from == null || to == null ? "Enter chainages like 0+000 or 1250"
    : to <= from ? "The end must be after the start"
      : !(step > 0) ? "Enter an interval in metres"
        : existing.some((s) => s.to > from && s.from < to) ? "This range overlaps sections the route already has"
          : null;
  const planned = useMemo(
    () => (error ? [] : buildSegments(from!, to!, step, existing.length)),
    [error, from, to, step, existing.length],
  );

  async function create() {
    if (!routeId || planned.length === 0) return;
    setSaving(true);
    try {
      const r = await addChainageSegments(routeId, planned);
      toast.success(`Added ${r.created.length} chainage section${r.created.length === 1 ? "" : "s"}${r.skipped.length ? ` · ${r.skipped.length} already there` : ""}`);
      onApplied();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to add chainage sections");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ruler className="h-4 w-4" /> Chainage sections</DialogTitle>
          <DialogDescription>
            Split a road, pipeline or cable route into chainage sections. Each section is planned like a floor: Generate creates its
            activities, and BOQ lines labelled with a chainage range (for example &quot;CH 0+000 – 1+500&quot;) are shared over the sections they cover.
          </DialogDescription>
        </DialogHeader>

        {routes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Add a route row first (for example &quot;RD1 Main Road&quot; or &quot;WM1 Water Main&quot;), then add its chainage sections.
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-1 text-xs font-medium">
              Route
              <select value={routeId} onChange={(e) => setRouteId(e.target.value)} className={field}>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.wbs_code} · {r.wbs_name}</option>)}
              </select>
            </label>
            {existing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                This route has {existing.length} section{existing.length === 1 ? "" : "s"}, CH {formatChainage(existing[0].from)} to {formatChainage(existing[existing.length - 1].to)}. New sections carry on from there.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-medium">Start chainage<input value={start} onChange={(e) => setStart(e.target.value)} className={field} placeholder="0+000" /></label>
              <label className="space-y-1 text-xs font-medium">End chainage<input value={end} onChange={(e) => setEnd(e.target.value)} className={field} placeholder="5+000" /></label>
              <label className="space-y-1 text-xs font-medium">
                Section length (m)
                <input type="number" min={1} value={sectionLength} onChange={(e) => setSectionLength(e.target.value)} className={field} />
              </label>
            </div>
            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-1.5">Code</th><th className="px-3 py-1.5">Section</th><th className="px-3 py-1.5 text-right">Length</th></tr>
                  </thead>
                  <tbody>
                    {planned.map((s) => (
                      <tr key={s.code} className="border-t border-border">
                        <td className="px-3 py-1 font-mono text-xs">{s.code}</td>
                        <td className="px-3 py-1">{s.name}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{Math.round((s.to - s.from) * 10) / 10} m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void create()} disabled={saving || planned.length === 0}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add {planned.length} section{planned.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
