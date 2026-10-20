"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { listLevelNodes, type LevelNode } from "@/lib/planning/activity-library/generation-service";
import {
  listLevelMap, listMetricMap, listProjectModels, modelReport, saveLevelMap,
  type BimModelLite, type ModelReport,
} from "@/lib/planning/activity-library/bim-quantity-service";
import { COVERAGE_MIN } from "@/lib/planning/activity-library/bim-quantity";
import { EmptyNote } from "./plan-act-shared";

const sel = "h-8 rounded-md border border-input bg-background px-1.5 text-xs";

/**
 * What Planning can take from the BIM extract: coverage per structural class (must be mostly usable before the `bim`
 * quantity provider counts it), the storey -> WBS level mapping, and the IFC class/unit -> metric rules.
 */
export function PlanActivityBim() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [models, setModels] = useState<BimModelLite[] | null>(null);
  const [modelId, setModelId] = useState("");
  const [nodes, setNodes] = useState<LevelNode[]>([]);
  const [report, setReport] = useState<ModelReport | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [metrics, setMetrics] = useState<{ metric_code: string; ifc_class: string; unit: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    (async () => {
      try {
        const [m, n, mm] = await Promise.all([listProjectModels(db, selectedProjectId), listLevelNodes(db, selectedProjectId), listMetricMap(db)]);
        if (!live) return;
        setModels(m); setNodes(n); setMetrics(mm);
        setModelId((cur) => cur || m[0]?.id || "");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load BIM models"); }
    })();
    return () => { live = false; };
  }, [db, selectedProjectId]);

  const loadReport = useCallback(async () => {
    const model = models?.find((m) => m.id === modelId);
    if (!model || !selectedProjectId) { setReport(null); return; }
    setBusy(true);
    try {
      const r = await modelReport(db, model, nodes.map((n) => ({ id: n.id, name: n.wbs_name })));
      const saved = await listLevelMap(db, selectedProjectId, model.id);
      const c: Record<string, string> = {};
      for (const s of r.suggestions) if (s.nodeId) c[s.bimLevel] = s.nodeId;
      for (const s of saved) c[s.bim_level] = s.wbs_node_id; // confirmed choices win over suggestions
      setReport(r); setChoice(c);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to read the model"); } finally { setBusy(false); }
  }, [db, models, modelId, nodes, selectedProjectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadReport() sets state after awaiting
  useEffect(() => { void loadReport(); }, [loadReport]);

  if (!selectedProjectId) return <div className="p-6"><EmptyNote>Select a project in the header.</EmptyNote></div>;
  if (!models) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (models.length === 0) return <div className="p-6"><EmptyNote>This project has no current BIM model. Upload one in the Design › BIM module first.</EmptyNote></div>;

  const anyReady = report?.coverage.some((c) => c.ready) ?? false;

  async function save() {
    if (!report) return;
    setBusy(true);
    try {
      await saveLevelMap(db, selectedProjectId, report.model.id, Object.entries(choice).filter(([, v]) => v).map(([bim_level, wbs_node_id]) => ({ bim_level, wbs_node_id })));
      toast.success("Level mapping saved");
      await loadReport();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <select className={cn(sel, "h-9")} value={modelId} onChange={(e) => setModelId(e.target.value)}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.model_name} · {m.discipline} · {m.revision}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => void loadReport()} disabled={busy}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Re-read model</Button>
      </div>

      {report && (
        <>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Coverage of the structural elements</h3>
            <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                  <th className="px-3 py-2">IFC class</th><th className="px-3 py-2">Elements</th><th className="px-3 py-2">With quantity</th>
                  <th className="px-3 py-2">With storey</th><th className="px-3 py-2">Usable</th><th className="px-3 py-2">Units</th><th className="px-3 py-2">Planning can use it</th>
                </tr>
              </thead>
              <tbody>
                {report.coverage.map((c) => (
                  <tr key={c.ifc_class} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{c.ifc_class}</td>
                    <td className="px-3 py-1.5">{c.total}</td>
                    <td className="px-3 py-1.5">{c.withQuantity}</td>
                    <td className="px-3 py-1.5">{c.withLevel}</td>
                    <td className="px-3 py-1.5 font-semibold">{Math.round(c.usableShare * 100)}%</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.units.join(", ") || "—"}</td>
                    <td className="px-3 py-1.5">
                      {c.ready ? <span className="inline-flex items-center gap-1 text-emerald-500"><Check className="h-4 w-4" /> yes</span>
                        : <span className="inline-flex items-center gap-1 text-amber-500"><AlertTriangle className="h-4 w-4" /> no (needs {Math.round(COVERAGE_MIN * 100)}%)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!anyReady && (
              <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500">
                The BIM extract does not carry usable quantities and storeys yet, so the BIM provider returns nothing and generation falls back to BOQ links, manual and calculated quantities.
                The Design/BIM team delivers this (see the brief in the Phase 3 plan). You can already map the storeys below.
              </p>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">BIM storey → WBS level</h3>
              <Button size="sm" onClick={save} disabled={busy || report.storeys.length === 0}>Save mapping</Button>
            </div>
            {report.storeys.length === 0 ? <EmptyNote>No element in this model has a storey yet, so there is nothing to map.</EmptyNote> : (
              <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
                <thead><tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground"><th className="px-3 py-2">BIM storey</th><th className="px-3 py-2">Elements</th><th className="px-3 py-2">WBS level</th></tr></thead>
                <tbody>
                  {report.storeys.map((s) => {
                    const sug = report.suggestions.find((x) => x.bimLevel === s.label);
                    return (
                      <tr key={s.label} className="border-t border-border">
                        <td className="px-3 py-1.5">{s.label}</td>
                        <td className="px-3 py-1.5">{s.elements}</td>
                        <td className="px-3 py-1.5">
                          <select className={sel} value={choice[s.label] ?? ""} onChange={(e) => setChoice({ ...choice, [s.label]: e.target.value })}>
                            <option value="">Not mapped</option>
                            {nodes.map((n) => <option key={n.id} value={n.id}>{n.wbs_name}</option>)}
                          </select>
                          {sug?.nodeId && choice[s.label] === sug.nodeId && <span className="ml-2 text-[11px] text-muted-foreground">suggested</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Which element quantity feeds which metric</h3>
        <div className="flex flex-wrap gap-2">
          {metrics.map((m, i) => (
            <span key={i} className="rounded-full border border-border bg-muted px-3 py-1 text-xs"><b>{m.metric_code}</b> ← {m.ifc_class} ({m.unit})</span>
          ))}
        </div>
      </section>
    </div>
  );
}
