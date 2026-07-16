"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Calculator, History, Loader2, MapPin, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type WbsNodeRecord, type WbsNodeQuantity, type GfaSummary, type CostPerSqmSummary } from "@/components/wbs/wbs-types";
import {
  getNodeQuantities,
  getNodeQuantityHistory,
  upsertGfa,
  upsertSiteArea,
  getBuildingGfaSummary,
  getCostPerSqm,
  getGfaWarnings,
} from "@/lib/qs-service";
import { currency } from "@/lib/evm-service";
import { cn } from "@/lib/utils";

interface Props {
  node: WbsNodeRecord;
  nodeRecord: WbsNodeRecord;
  onSave: () => void;
}

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtM2(v: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function WbsNodeQuantitiesTab({ node, nodeRecord, onSave }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quantities, setQuantities] = useState<WbsNodeQuantity[]>([]);
  const [history, setHistory] = useState<WbsNodeQuantity[]>([]);
  const [gfaSummary, setGfaSummary] = useState<GfaSummary | null>(null);
  const [costPerSqm, setCostPerSqm] = useState<CostPerSqmSummary | null>(null);
  const [warnings, setWarnings] = useState<{ wbs_node_id: string; wbs_code: string; wbs_name: string; cost: number }[]>([]);

  const [gfaValue, setGfaValue] = useState("");
  const [gfaSource, setGfaSource] = useState("");
  const [gfaReason, setGfaReason] = useState("");
  const [siteAreaValue, setSiteAreaValue] = useState("");
  const [siteAreaSource, setSiteAreaSource] = useState("");
  const [siteAreaReason, setSiteAreaReason] = useState("");

  const isLevel = node.node_type === "level";
  const isBuilding = node.node_type === "building";
  const isProject = !node.parent_id && node.node_type !== "level" && node.node_type !== "building";
  const isBasement = nodeRecord.is_basement ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = await getNodeQuantities(node.id);
      setQuantities(q);

      const gfa = q.find((x) => x.metric_code === "GFA");
      if (gfa) {
        setGfaValue(gfa.value.toString());
        setGfaSource(gfa.source_ref);
      }

      const site = q.find((x) => x.metric_code === "SITE_AREA");
      if (site) {
        setSiteAreaValue(site.value.toString());
        setSiteAreaSource(site.source_ref);
      }

      if (isLevel || isBuilding) {
        const hist = await getNodeQuantityHistory(node.id, "GFA");
        setHistory(hist);
      }

      if (isBuilding && nodeRecord.project_id) {
        const gfaSum = await getBuildingGfaSummary(node.id);
        setGfaSummary(gfaSum);
        const cps = await getCostPerSqm(nodeRecord.project_id);
        setCostPerSqm(cps);
      }

      if (isProject && nodeRecord.project_id) {
        const cps = await getCostPerSqm(nodeRecord.project_id);
        setCostPerSqm(cps);
        const warn = await getGfaWarnings(nodeRecord.project_id);
        setWarnings(warn);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load quantities");
    } finally {
      setLoading(false);
    }
  }, [node.id, node.node_type, nodeRecord.is_basement, nodeRecord.project_id, isBuilding, isLevel, isProject]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveGfa() {
    const val = parseFloat(gfaValue);
    if (isNaN(val) || val <= 0) {
      toast.error("GFA must be a positive number");
      return;
    }
    if (!gfaSource.trim()) {
      toast.error("Source reference is required (drawing revision)");
      return;
    }
    setSaving(true);
    try {
      const existing = quantities.find((q) => q.metric_code === "GFA");
      if (existing && !gfaReason.trim()) {
        toast.error("Reason is required when editing existing GFA");
        setSaving(false);
        return;
      }
      const result = await upsertGfa({
        wbs_node_id: node.id,
        project_id: nodeRecord.project_id,
        value: val,
        source_ref: gfaSource.trim(),
        revised_reason: gfaReason.trim() || undefined,
      });
      toast.success(
        result.revised
          ? `GFA revised: ${result.old_value} m² → ${result.new_value} m²`
          : `GFA set: ${result.new_value} m²`
      );
      setGfaReason("");
      await load();
      onSave();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save GFA");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSiteArea() {
    const val = parseFloat(siteAreaValue);
    if (isNaN(val) || val <= 0) {
      toast.error("Site Area must be a positive number");
      return;
    }
    if (!siteAreaSource.trim()) {
      toast.error("Source reference is required (title deed / survey ref)");
      return;
    }
    setSaving(true);
    try {
      const existing = quantities.find((q) => q.metric_code === "SITE_AREA");
      if (existing && !siteAreaReason.trim()) {
        toast.error("Reason is required when editing existing Site Area");
        setSaving(false);
        return;
      }
      const result = await upsertSiteArea({
        wbs_node_id: node.id,
        project_id: nodeRecord.project_id,
        value: val,
        source_ref: siteAreaSource.trim(),
        revised_reason: siteAreaReason.trim() || undefined,
      });
      toast.success(
        result.revised
          ? `Site Area revised: ${result.old_value} m² → ${result.new_value} m²`
          : `Site Area set: ${result.new_value} m²`
      );
      setSiteAreaReason("");
      await load();
      onSave();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Site Area");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Level Node: GFA Input ──────────────────────────────── */}
      {isLevel && (
        <>
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calculator className="h-4 w-4" />
                GFA Measurement
              </div>
              {isBasement && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  Basement Level
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gfa_value">GFA (m²) *</Label>
                <input
                  id="gfa_value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={gfaValue}
                  onChange={(e) => setGfaValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  placeholder="e.g. 850"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gfa_source">Source (Drawing Ref) *</Label>
                <input
                  id="gfa_source"
                  value={gfaSource}
                  onChange={(e) => setGfaSource(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  placeholder="e.g. DWG-ARC-001 Rev.A"
                />
              </div>
              {quantities.find((q) => q.metric_code === "GFA") && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="gfa_reason">Revision Reason *</Label>
                  <input
                    id="gfa_reason"
                    value={gfaReason}
                    onChange={(e) => setGfaReason(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                    placeholder="Reason for change (required when editing)"
                  />
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveGfa} disabled={saving || !gfaValue || !gfaSource.trim()}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving ? "Saving..." : "Save GFA"}
              </Button>
            </div>
          </section>

          {/* Revision History */}
          {history.length > 0 && (
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" />
                Revision History
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Value (m²)</th>
                      <th className="px-3 py-2 text-left">Source</th>
                      <th className="px-3 py-2 text-left">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-500">{fmtDate(h.revised_at ?? h.created_at)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtM2(h.value)}</td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                            {h.source_ref}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{h.revised_reason ?? (h.is_current ? "Initial" : "Superseded")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Building Node: GFA Rollup + Cost/m² ──────────────── */}
      {isBuilding && (
        <>
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Calculator className="h-4 w-4" />
              GFA Rollup
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-emerald-50 p-3 text-center">
                <div className="text-lg font-bold text-emerald-700">{fmtM2(gfaSummary?.gfa_above_ground ?? 0)} m²</div>
                <div className="mt-1 text-[10px] text-emerald-600">Above Ground</div>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <div className="text-lg font-bold text-amber-700">{fmtM2(gfaSummary?.gfa_basement ?? 0)} m²</div>
                <div className="mt-1 text-[10px] text-amber-600">Basement</div>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-center">
                <div className="text-lg font-bold text-slate-900">{fmtM2(gfaSummary?.gfa_total ?? 0)} m²</div>
                <div className="mt-1 text-[10px] text-slate-500">GFA Total</div>
              </div>
            </div>
          </section>

          {costPerSqm && (
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4" />
                Cost per m²
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-50 p-3 text-center">
                  <div className="text-lg font-bold text-emerald-700">{currency(costPerSqm.above_ground_cost_per_sqm)}</div>
                  <div className="mt-1 text-[10px] text-emerald-600">Above Ground /m²</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 text-center">
                  <div className="text-lg font-bold text-amber-700">{currency(costPerSqm.basement_cost_per_sqm)}</div>
                  <div className="mt-1 text-[10px] text-amber-600">Basement /m²</div>
                </div>
                <div className="rounded-lg bg-slate-100 p-3 text-center">
                  <div className="text-lg font-bold text-slate-900">{currency(costPerSqm.blended_cost_per_sqm)}</div>
                  <div className="mt-1 text-[10px] text-slate-500">Blended /m²</div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Project Node: Site Area + Standard Summary ────────── */}
      {isProject && (
        <>
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4" />
              Site Area
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="site_area_value">Site Area (m²) *</Label>
                <input
                  id="site_area_value"
                  type="number"
                  step="0.01"
                  min="0"
                  value={siteAreaValue}
                  onChange={(e) => setSiteAreaValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  placeholder="e.g. 4500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="site_area_source">Source (Title Deed / Survey Ref) *</Label>
                <input
                  id="site_area_source"
                  value={siteAreaSource}
                  onChange={(e) => setSiteAreaSource(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                  placeholder="e.g. Title Deed Ref / Survey Plan"
                />
              </div>
              {quantities.find((q) => q.metric_code === "SITE_AREA") && (
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="site_area_reason">Revision Reason *</Label>
                  <input
                    id="site_area_reason"
                    value={siteAreaReason}
                    onChange={(e) => setSiteAreaReason(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                    placeholder="Reason for change"
                  />
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveSiteArea} disabled={saving || !siteAreaValue || !siteAreaSource.trim()}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving ? "Saving..." : "Save Site Area"}
              </Button>
            </div>
          </section>

          {costPerSqm && (
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Calculator className="h-4 w-4" />
                Standard Final Cost Summary (per DCOS-QS-GDL-001 §9)
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2 text-left">Line</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Cost (USD)</th>
                      <th className="px-3 py-2 text-right">Denominator</th>
                      <th className="px-3 py-2 text-right">$/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costPerSqm.standard_summary.lines.map((line, i) => (
                      <tr key={i} className={cn("border-b border-slate-100 last:border-0", i === 2 && "bg-slate-50 font-semibold")}>
                        <td className="px-3 py-2 text-slate-500">{["1", "2", "A", "3"][i] ?? ""}</td>
                        <td className="px-3 py-2">{line.label}</td>
                        <td className="px-3 py-2 text-right">{currency(line.cost)}</td>
                        <td className="px-3 py-2 text-right">{fmtM2(line.denominator)} {line.denominator_unit}</td>
                        <td className="px-3 py-2 text-right font-semibold">{currency(line.cost_per_sqm)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-slate-50">
                      <td className="px-3 py-2 font-semibold">B</td>
                      <td className="px-3 py-2 font-semibold">TOTAL CONTRACT</td>
                      <td className="px-3 py-2 text-right font-semibold">{currency(costPerSqm.standard_summary.total_contract)}</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                    </tr>
                    {costPerSqm.standard_summary.memo_cost_per_sqm !== null && (
                      <tr className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-400 italic">memo</td>
                        <td className="px-3 py-2 text-slate-400 italic">Whole project ÷ GFA (memo only)</td>
                        <td className="px-3 py-2 text-right text-slate-400">{currency(costPerSqm.standard_summary.total_contract)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{fmtM2(costPerSqm.gfa_summary.gfa_total)} m² GFA</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-400">{currency(costPerSqm.standard_summary.memo_cost_per_sqm)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* GFA Warnings */}
          {warnings.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                GFA Missing — Cost/M² Cannot Calculate
              </div>
              <div className="space-y-2">
                {warnings.map((w) => (
                  <div key={w.wbs_node_id} className="flex items-center justify-between rounded-lg bg-white p-2 text-xs">
                    <div>
                      <span className="font-mono font-semibold">{w.wbs_code}</span>
                      <span className="ml-2 text-slate-600">{w.wbs_name}</span>
                    </div>
                    <span className="text-amber-600">Cost: {currency(w.cost)} — No GFA entered</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
