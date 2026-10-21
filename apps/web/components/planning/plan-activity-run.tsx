"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { listQuantityRules } from "@/lib/planning/activity-library/library-service";
import {
  acceptHighConfidence, assignRunResources, listOverrides, loadRun, overrideItem, setItemReview,
  type OverrideField, type OverrideRow, type ReviewItem, type RunRow,
} from "@/lib/planning/activity-library/generation-service";
import type { ExceptionReason } from "@/lib/planning/activity-library/confidence";
import { CodeChip, EmptyNote } from "./plan-act-shared";
import { PlanActivityBoqLink } from "./plan-activity-boq-link";
import { PlanAiRunPanel } from "./plan-ai-run-panel";
import { listQuantityLinks, resyncItemFromBoq } from "@/lib/planning/activity-library/boq-quantity-service";
import { ConfidencePill, REASON_LABEL } from "./plan-act-confidence";

type Filter = "all" | "review" | "low" | "missing" | "logic" | "quantity" | "ai" | "overridden";

const MISSING: ExceptionReason[] = ["missing_quantity", "no_productivity", "unknown_method", "missing_predecessor"];
const FILTERS: { key: Filter; label: string; test: (i: ReviewItem) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "review", label: "Review required", test: (i) => i.confidence !== "high" },
  { key: "low", label: "Low confidence", test: (i) => i.confidence === "low" },
  { key: "missing", label: "Missing data", test: (i) => i.reasons.some((r) => MISSING.includes(r)) },
  { key: "logic", label: "Logic conflict", test: (i) => i.reasons.some((r) => r === "logic_conflict" || r === "missing_predecessor") },
  { key: "quantity", label: "Quantity", test: (i) => i.reasons.some((r) => r === "missing_quantity" || r === "unit_mismatch") },
  { key: "ai", label: "AI suggestions", test: (i) => i.reasons.includes("ai_suggestion") },
  { key: "overridden", label: "Overridden", test: (i) => i.reasons.includes("planner_override") },
];

export function PlanActivityRun({ runId, projectId }: { runId: string; projectId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [run, setRun] = useState<RunRow | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [filter, setFilter] = useState<Filter>("review");
  const [editing, setEditing] = useState<ReviewItem | null>(null);
  const [linking, setLinking] = useState<ReviewItem | null>(null);
  const [driftNodes, setDriftNodes] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const r = await loadRun(supabase, runId);
      setRun(r.run); setItems(r.items);
      setOverrides(await listOverrides(supabase, projectId, r.items.map((i) => i.id)));
      // BOQ lines that moved since the planner confirmed them (the generated quantity is then out of date)
      setDriftNodes(new Set((await listQuantityLinks(supabase, projectId)).filter((l) => l.drifted).map((l) => l.wbs_node_id)));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load run"); }
  }, [supabase, runId, projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  if (!run) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const shown = items.filter(FILTERS.find((f) => f.key === filter)!.test);
  const pending = items.filter((i) => i.review_status === "pending").length;
  const count = (k: Filter) => items.filter(FILTERS.find((f) => f.key === k)!.test).length;

  async function act(fn: () => Promise<unknown>, msg: string) {
    try { await fn(); toast.success(msg); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => router.push("/dashboard/planning/activity-library/generate")}><ArrowLeft className="mr-1 h-4 w-4" /> Generation</Button>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-sm font-semibold text-primary">Generation Run #{run.run_no}</div>
            <div className="text-xs text-muted-foreground">
              {run.kit_id ? `Kit ${run.library_snapshot?.kit?.code ?? ""} v${run.kit_version ?? ""}` : `Template v${run.template_version}`} · engine {run.engine_version} · {new Date(run.created_at).toLocaleString()}
            </div>
          </div>
          <div className="flex gap-6 text-center">
            {[["High", run.high_count, "text-emerald-600"], ["Review", run.review_count, "text-amber-600"], ["Low", run.low_count, "text-red-600"], ["Pending", pending, ""]].map(([l, v, c]) => (
              <div key={l as string}><div className={cn("font-mono text-xl font-bold", c as string)}>{v}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground hover:border-primary")}>
              {f.label} ({count(f.key)})
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <PlanAiRunPanel runId={runId} projectId={projectId} itemIds={items.map((i) => i.id)} onChanged={() => void load()} />
        {shown.length === 0 ? <EmptyNote>Nothing in this filter.</EmptyNote> : (
          <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
            <thead><tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-3 py-2">Level</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Method</th><th className="px-3 py-2">Confidence</th><th className="px-3 py-2">Why</th><th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className={cn("border-t border-border", i.confidence === "low" && "bg-red-500/10", i.confidence === "review" && "bg-amber-500/10")}>
                  <td className="px-3 py-1.5">{i.node_name}</td>
                  <td className="px-3 py-1.5"><CodeChip code={i.master_code} /><div className="text-xs text-muted-foreground">{i.master_name}{run.kit_id && i.template_code ? <span className="ml-1 text-[10px] opacity-70">· {i.template_code}</span> : null}</div></td>
                  <td className="px-3 py-1.5">{i.quantity != null ? `${i.quantity} ${i.unit ?? ""}` : "—"}{i.quantity_source && <span className="ml-1 text-[10px] uppercase text-muted-foreground">{i.quantity_source}</span>}{i.quantity_source === "boq" && i.node_id && driftNodes.has(i.node_id) && (
                      <button className="mt-0.5 rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-500" title="The BOQ line changed after it was linked. Click to update this quantity."
                        onClick={async () => {
                          try {
                            const rules = i.master_id ? await listQuantityRules(supabase, i.master_id) : [];
                            if (!rules[0]) throw new Error("No quantity rule on this activity");
                            await resyncItemFromBoq(supabase, projectId, i, rules[0].metric_code);
                            toast.success("Quantity updated from the revised BOQ");
                            await load();
                          } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}>BOQ changed · update</button>
                    )}{i.quantity_ref && <div className="max-w-48 truncate text-[10px] text-muted-foreground" title={i.quantity_ref}>{i.quantity_ref}</div>}</td>
                  <td className="px-3 py-1.5">{i.duration_days != null ? `${i.duration_days} d` : "—"}</td>
                  <td className="px-3 py-1.5 text-xs">{i.method_name ?? "—"}</td>
                  <td className="px-3 py-1.5"><ConfidencePill value={i.confidence} />{i.review_status !== "pending" && <div className="text-[10px] uppercase text-muted-foreground">{i.review_status}</div>}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{i.reasons.map((r) => REASON_LABEL[r]).join(", ")}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {(i.quantity != null || i.reasons.includes("missing_quantity")) && i.quantity_source !== "boq" && <Button size="sm" variant="ghost" onClick={() => setLinking(i)}>Find in BOQ</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Override</Button>
                    {i.review_status !== "accepted" && <Button size="sm" variant="outline" disabled={i.confidence === "low"} onClick={() => act(() => setItemReview(supabase, [i.id], "accepted"), "Accepted")}>Accept</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {overrides.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Override log</h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
              {overrides.map((o) => (
                <li key={o.id} className="px-4 py-2"><b>{o.field}</b>: {o.old_value ?? "—"} → {o.new_value} <span className="text-muted-foreground">— {o.reason} ({new Date(o.changed_at).toLocaleString()})</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-3">
        <p className="text-xs text-muted-foreground">Tasks are in the WBS now. Run <b>Schedule</b> in the WBS builder to calculate dates, then set the baseline in Planning once the planner is satisfied.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            try {
              const r = await assignRunResources(supabase, runId, projectId);
              toast.success(`Equipment: ${r.equipmentAssignments} assignments (${r.equipmentResources} new resources). Labour: ${r.labourAssignments} assignments${r.labourAssignments === 0 ? " - run Schedule first so crews can be sized" : ""}`);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
          }}>Assign resources</Button>
          <Button variant="outline" onClick={() => act(() => acceptHighConfidence(supabase, runId), "High-confidence items accepted")}>Accept all high confidence ({run.high_count})</Button>
          <Button onClick={() => router.push("/dashboard/planning/gantt")}>Open Gantt</Button>
        </div>
      </div>

      {linking && (
        <PlanActivityBoqLink
          item={linking}
          runId={runId}
          siblings={items.filter((x) => x.master_id === linking.master_id)}
          projectId={projectId}
          onClose={() => setLinking(null)}
          onDone={() => { setLinking(null); void load(); }}
        />
      )}
      {editing && <OverrideDialog item={editing} projectId={projectId} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function OverrideDialog({ item, projectId, onClose, onDone }: { item: ReviewItem; projectId: string; onClose: () => void; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [field, setField] = useState<OverrideField>(item.quantity == null ? "quantity" : "duration_days");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [metric, setMetric] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    if (item.master_id) void listQuantityRules(supabase, item.master_id).then((r) => { if (live) setMetric(r[0]?.metric_code ?? null); });
    return () => { live = false; };
  }, [supabase, item.master_id]);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || value.trim() === "") { toast.error("Enter a valid number"); return; }
    if (!reason.trim()) { toast.error("A reason is required"); return; }
    setSaving(true);
    try { await overrideItem(supabase, projectId, item, field, n, reason, metric); toast.success("Override recorded"); onDone(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Override — {item.master_code} @ {item.node_name}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <Button size="sm" variant={field === "quantity" ? "default" : "outline"} disabled={!metric} onClick={() => setField("quantity")}>Quantity</Button>
            <Button size="sm" variant={field === "duration_days" ? "default" : "outline"} onClick={() => setField("duration_days")}>Duration</Button>
          </div>
          <p className="text-muted-foreground">
            Current: quantity {item.quantity ?? "—"} {item.unit}, duration {item.duration_days ?? "—"} d.
            {field === "quantity" && " Duration is recalculated from the productivity standard."}
          </p>
          <Input type="number" placeholder={field === "quantity" ? `New quantity (${item.unit ?? ""})` : "New duration (working days)"} value={value} onChange={(e) => setValue(e.target.value)} />
          <Input placeholder="Reason (required, e.g. restricted truck access)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={save}>Record override</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
