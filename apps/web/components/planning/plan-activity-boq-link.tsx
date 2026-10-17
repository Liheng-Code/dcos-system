"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { listQuantityRules } from "@/lib/planning/activity-library/library-service";
import type { ReviewItem } from "@/lib/planning/activity-library/generation-service";
import { linkBoqToItems, suggestBoqForItem, type BoqSuggestionRow } from "@/lib/planning/activity-library/boq-quantity-service";
import { evenShare, levelRangeHint, unitsCompatible } from "@/lib/planning/activity-library/boq-quantity";
import type { ActQuantityRule } from "@/lib/planning/activity-library/types";
import { PlanAiSuggestionList, useAskAi } from "./plan-ai-suggestions";

/**
 * Pick the BOQ line that gives this activity its quantity. A line that covers several levels can be shared out over the
 * levels of the run (equal shares by default, editable). Nothing is applied until the planner confirms with a reason.
 */
export function PlanActivityBoqLink({
  item, siblings, projectId, runId, onClose, onDone,
}: {
  item: ReviewItem;
  /** every item of the run with the same activity (one per level), including `item` */
  siblings: ReviewItem[];
  projectId: string;
  runId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const db = useMemo(() => createClient(), []);
  const ai = useAskAi();
  const [rule, setRule] = useState<ActQuantityRule | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<BoqSuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"one" | "spread">("one");
  const [pct, setPct] = useState("100");
  const [exact, setExact] = useState<number | null>(null);
  const [reason, setReason] = useState("Confirmed BOQ line for this activity");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void (item.master_id ? listQuantityRules(db, item.master_id) : Promise.resolve([])).then((r) => { if (live) setRule(r[0] ?? null); });
    return () => { live = false; };
  }, [db, item.master_id]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      if (rule === undefined) return;
      suggestBoqForItem(db, projectId, item, { metricUnit: rule?.unit ?? null }, search)
        .then((r) => { if (live) setRows(r.suggestions); })
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not load the BOQ"))
        .finally(() => { if (live) setLoading(false); });
    }, search ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [db, projectId, item, search, rule]);

  const picked = rows.find((r) => r.candidate.id === pickedId)?.candidate ?? null;
  const hint = picked ? levelRangeHint(picked.description) : null;
  const n = siblings.length;
  const factor = exact ?? Math.max(0, Number(pct) / 100);
  const targets = mode === "spread" ? siblings : [item];
  const unitOk = picked ? unitsCompatible(picked.unit, rule?.unit ?? null) : true;

  function chooseMode(m: "one" | "spread") {
    setMode(m);
    const share = m === "spread" ? evenShare(hint && hint <= n ? hint : n) : null;
    setExact(share);
    setPct(share != null ? String(Math.round(share * 10000) / 100) : "100");
  }

  async function confirm() {
    if (!picked || !rule) return;
    if (!(factor > 0)) { toast.error("The share must be greater than zero"); return; }
    setSaving(true);
    try {
      const applied = await linkBoqToItems(db, {
        projectId, candidate: picked, metricCode: rule.metric_code, metricUnit: rule.unit,
        targets: targets.map((item) => ({ item, factor })), reason,
      });
      toast.success(`BOQ ${picked.code ?? ""} linked to ${applied} level${applied === 1 ? "" : "s"}`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not link"); setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Find in BOQ — {item.master_code} @ {item.node_name}</DialogTitle></DialogHeader>
        {rule === undefined ? <Loader2 className="h-5 w-5 animate-spin" /> : rule === null ? (
          <p className="text-sm text-muted-foreground">This activity has no quantity rule, so a BOQ line cannot feed it. Add a quantity rule to the activity first.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Needed: <b>{rule.name}</b> ({rule.metric_code}{rule.unit ? `, ${rule.unit}` : ""}). Suggestions are ranked by activity name and level; confirm the one that is right.
            </p>
            <div className="flex gap-2">
              <Input placeholder="Search the BOQ by description or item number…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Button type="button" variant="outline" disabled={ai.busy} onClick={() => void ai.ask({ tool: "suggest_quantity_mapping", runId, itemId: item.id })}>
                {ai.busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Ask AI
              </Button>
            </div>
            {ai.message && <p className="text-xs text-muted-foreground">{ai.message}</p>}
            {ai.fresh.length > 0 && <PlanAiSuggestionList suggestions={ai.fresh} projectId={projectId} onChanged={onDone} />}
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1">
              {loading ? <div className="p-3"><Loader2 className="h-4 w-4 animate-spin" /></div> : rows.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No BOQ line looks like this activity. Use the search box.</p>
              ) : rows.map((r) => {
                const ok = unitsCompatible(r.candidate.unit, rule.unit);
                return (
                  <label key={r.candidate.source + r.candidate.id}
                    className={cn("flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted", pickedId === r.candidate.id && "bg-primary/10")}>
                    <input type="radio" className="mt-1" checked={pickedId === r.candidate.id} onChange={() => { setPickedId(r.candidate.id); setMode("one"); setPct("100"); setExact(null); }} />
                    <span className="flex-1">
                      <span className="font-mono text-xs text-primary">{r.candidate.code ?? "—"}</span> {r.candidate.description}
                      <span className="block text-xs text-muted-foreground">
                        {r.candidate.source === "qs_boq" ? "Project BOQ" : "Tender BOQ"} · {r.candidate.quantity} {r.candidate.unit}
                        {r.score > 0 && ` · match ${Math.round(r.score * 100)}%`} {r.reasons.length > 0 && `(${r.reasons.join(", ")})`}
                        {!ok && <span className="ml-1 font-semibold text-red-500">unit differs from {rule.unit}</span>}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {picked && (
              <div className="space-y-3 rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-1"><input type="radio" checked={mode === "one"} onChange={() => chooseMode("one")} /> This level only</label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={mode === "spread"} onChange={() => chooseMode("spread")} disabled={n < 2} />
                    Share over the {n} levels of this run
                  </label>
                  <label className="flex items-center gap-1">Share per level <Input className="h-8 w-20" type="number" min={0.01} value={pct} onChange={(e) => { setPct(e.target.value); setExact(null); }} /> %</label>
                </div>
                {hint && <p className="text-xs text-amber-500">The BOQ description names {hint} levels{hint !== n ? `, this run has ${n}` : ""}.</p>}
                <p>
                  Quantity per level: <b>{Math.round(picked.quantity * factor * 1000) / 1000} {picked.unit}</b>
                  <span className="text-muted-foreground"> ({picked.quantity} × {Math.round(factor * 10000) / 100}%) — applied to {targets.length} level{targets.length === 1 ? "" : "s"}</span>
                </p>
                {!unitOk && <p className="text-xs font-semibold text-red-500">Unit differs from the activity ({rule.unit}). Linking is blocked.</p>}
                <Input placeholder="Reason / note" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!picked || !rule || saving || !unitOk || !reason.trim()} onClick={confirm}>{saving ? "Linking…" : "Link and recalculate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
