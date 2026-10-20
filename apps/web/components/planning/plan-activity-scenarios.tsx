"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { compareScenarios, type GenerationRequest } from "@/lib/planning/activity-library/generation-service";
import {
  BASE_VARIANT, delta, variantIsBase, type ScenarioOutcome, type ScenarioVariant,
} from "@/lib/planning/activity-library/scenario-compare";
import type { MasterContext } from "@/lib/planning/activity-library/generation-planner";

interface Scenario { name: string; variant: ScenarioVariant }

const LETTERS = ["A", "B", "C", "D"];
const sel = "h-8 rounded-md border border-input bg-background px-1.5 text-xs";

/** Side-by-side what-if: nothing is written. "Use this scenario" hands the variant back to the Generate page. */
export function PlanActivityScenarios({
  request, onUse, onClose,
}: {
  request: GenerationRequest;
  onUse: (variant: ScenarioVariant, name: string) => void;
  onClose: () => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { name: "Current settings", variant: BASE_VARIANT },
    { name: "Scenario B", variant: { ...BASE_VARIANT } },
  ]);
  const [options, setOptions] = useState<MasterContext[]>([]);
  const [hasLevelLink, setHasLevelLink] = useState(false);
  const [outcomes, setOutcomes] = useState<ScenarioOutcome[] | null>(null);
  const [start, setStart] = useState<string>("");
  const [busy, setBusy] = useState(true);

  // one dry load to learn which activities offer a choice of method
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await compareScenarios(db, request, [BASE_VARIANT]);
        if (!live) return;
        setOptions(Object.values(r.preview.input.contexts).filter((c) => c.methods.length > 1));
        setHasLevelLink(!!r.preview.input.interLevel);
        setOutcomes(r.outcomes);
        setStart(r.start);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Could not load the comparison"); }
      finally { if (live) setBusy(false); }
    })();
    return () => { live = false; };
  }, [db, request]);

  const patch = (i: number, p: Partial<ScenarioVariant>) => {
    setScenarios((s) => s.map((x, k) => (k === i ? { ...x, variant: { ...x.variant, ...p } } : x)));
    setOutcomes(null);
  };

  async function run() {
    setBusy(true);
    try {
      const r = await compareScenarios(db, request, scenarios.map((s) => s.variant));
      setOutcomes(r.outcomes); setStart(r.start);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Comparison failed"); } finally { setBusy(false); }
  }

  const ref = outcomes?.[0]?.metrics ?? null;
  const rows: { label: string; get: (o: ScenarioOutcome) => number | null; unit?: string; good: "low" | "high" | "none"; text?: (o: ScenarioOutcome) => string }[] = [
    { label: "Programme length", get: (o) => o.metrics.spanDays, unit: "wd", good: "low" },
    { label: "Finish date", get: () => null, good: "none", text: (o) => o.metrics.finish ?? "—" },
    { label: "Total task-days", get: (o) => o.metrics.taskDays, unit: "d", good: "low" },
    { label: "Critical activities", get: (o) => o.metrics.criticalCount, good: "none" },
    { label: "Review + low confidence", get: (o) => o.metrics.review + o.metrics.low, good: "low" },
    { label: "Without a duration", get: (o) => o.metrics.unsized, good: "low" },
  ];

  const tone = (d: number | null, good: "low" | "high" | "none") =>
    d == null || d === 0 || good === "none" ? "text-muted-foreground" : (d < 0) === (good === "low") ? "text-emerald-500" : "text-red-500";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>Compare scenarios</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          What-if on the levels you selected. Nothing is written. Fixed durations from the template are not affected by method or productivity changes.
          Programme length is laid out from {start || "the project start"} on the project calendar.
        </p>

        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${scenarios.length}, minmax(0, 1fr))` }}>
          {scenarios.map((s, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{LETTERS[i]}</span>
                {i === 0 ? <span className="text-sm font-semibold">{s.name}</span> : (
                  <Input className="h-8 text-sm" value={s.name} onChange={(e) => setScenarios(scenarios.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                )}
                {i > 1 && <Button size="icon" variant="ghost" aria-label="Remove scenario" onClick={() => { setScenarios(scenarios.filter((_, k) => k !== i)); setOutcomes(null); }}><Trash2 className="h-4 w-4" /></Button>}
              </div>
              {i === 0 ? <p className="text-xs text-muted-foreground">The reference. Everything is compared with this.</p> : (
                <>
                  {options.map((c) => (
                    <label key={c.master.id} className="block text-xs">
                      <span className="mb-0.5 block text-muted-foreground">{c.master.name}</span>
                      <select className={cn(sel, "w-full")} value={s.variant.methodByMaster[c.master.id] ?? ""}
                        onChange={(e) => {
                          const m = { ...s.variant.methodByMaster };
                          if (e.target.value) m[c.master.id] = e.target.value; else delete m[c.master.id];
                          patch(i, { methodByMaster: m });
                        }}>
                        <option value="">Template choice</option>
                        {c.methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </label>
                  ))}
                  <label className="block text-xs">
                    <span className="mb-0.5 block text-muted-foreground">Productivity of every standard (%)</span>
                    <Input className="h-8" type="number" min={10} max={300} value={s.variant.productivityPct}
                      onChange={(e) => patch(i, { productivityPct: Number(e.target.value) || 100 })} />
                  </label>
                  {hasLevelLink && (
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={s.variant.linkLevels} onChange={(e) => patch(i, { linkLevels: e.target.checked })} />
                      Link consecutive levels
                    </label>
                  )}
                  {variantIsBase(s.variant) && <p className="text-[11px] text-amber-500">Same as the reference: change something.</p>}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={run} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Run comparison</Button>
          {scenarios.length < 4 && (
            <Button size="sm" variant="outline" onClick={() => { setScenarios([...scenarios, { name: `Scenario ${LETTERS[scenarios.length]}`, variant: { ...BASE_VARIANT } }]); setOutcomes(null); }}>
              <Plus className="mr-1 h-4 w-4" /> Add scenario
            </Button>
          )}
        </div>

        {outcomes && outcomes.length === scenarios.length && ref && (
          <div className="space-y-5">
            <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                  <th className="px-3 py-2" />
                  {scenarios.map((s, i) => <th key={i} className="px-3 py-2">{LETTERS[i]} · {s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-border">
                    <td className="px-3 py-1.5 text-muted-foreground">{r.label}</td>
                    {outcomes.map((o, i) => {
                      const d = delta(r.get(o), r.get(outcomes[0]));
                      return (
                        <td key={i} className="px-3 py-1.5">
                          <b>{r.text ? r.text(o) : d.value ?? "—"}</b>{r.unit && d.value != null ? ` ${r.unit}` : ""}
                          {i > 0 && d.delta != null && d.delta !== 0 && <span className={cn("ml-2 text-xs font-semibold", tone(d.delta, r.good))}>{d.delta > 0 ? "+" : ""}{d.delta}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-3 py-1.5" />
                  {outcomes.map((o, i) => (
                    <td key={i} className="px-3 py-1.5">
                      {i > 0 && !o.metrics.loop && (
                        <Button size="sm" variant="outline" onClick={() => { onUse(scenarios[i].variant, scenarios[i].name); onClose(); }}>Use this scenario</Button>
                      )}
                      {o.metrics.loop && <span className="text-xs text-red-500">Circular links: {o.metrics.loop.join(" → ")}</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Per level (task-days / span in working days)</h4>
              <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                    <th className="px-3 py-2">Level</th>
                    {scenarios.map((s, i) => <th key={i} className="px-3 py-2">{LETTERS[i]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {outcomes[0].metrics.perLevel.map((lv, k) => (
                    <tr key={lv.nodeId} className="border-t border-border">
                      <td className="px-3 py-1.5">{lv.name}</td>
                      {outcomes.map((o, i) => {
                        const l = o.metrics.perLevel[k];
                        const d = delta(l.taskDays, lv.taskDays);
                        return (
                          <td key={i} className="px-3 py-1.5">
                            {l.taskDays} d{l.spanDays != null ? ` / ${l.spanDays}` : ""}
                            {i > 0 && d.delta ? <span className={cn("ml-2 text-xs font-semibold", tone(d.delta, "low"))}>{d.delta > 0 ? "+" : ""}{d.delta}</span> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
