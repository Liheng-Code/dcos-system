"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Building2, Layers, Loader2, MapPin, Ruler } from "lucide-react";
import { toast } from "sonner";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { MetricCard } from "@/components/qs/cost-control";
import {
  getCostPerM2Summary, getElementalBreakdown, getFinalCostSummary, getGfaDataQualityWarnings,
  type CostPerM2Summary, type ElementalBreakdownLine, type FinalCostSummaryLine, type GfaDataQualityWarning,
} from "@/lib/qs/qs-service";
import { cn } from "@/lib/utils";

interface Props { projectId: string; projectName?: string }

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(value);

const rate = (value: number | null) => value == null ? "—" : `$${value.toFixed(2)}/m²`;

const ELEMENTAL_LABELS: Record<string, string> = {
  substructure: "Substructure",
  superstructure: "Superstructure",
  architectural: "Architectural works & finishes",
  mep: "MEP services",
  prelims: "Preliminaries",
  unclassified: "Unclassified",
};

export function CostPerM2Dashboard({ projectId }: Props) {
  const { can, loaded, isClientOrConsultant } = useQsPermissions();
  const [summary, setSummary] = useState<CostPerM2Summary | null>(null);
  const [elemental, setElemental] = useState<ElementalBreakdownLine[]>([]);
  const [finalSummary, setFinalSummary] = useState<FinalCostSummaryLine[]>([]);
  const [warnings, setWarnings] = useState<GfaDataQualityWarning[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, e, f, w] = await Promise.all([
        getCostPerM2Summary(projectId),
        getElementalBreakdown(projectId),
        getFinalCostSummary(projectId),
        getGfaDataQualityWarnings(projectId),
      ]);
      setSummary(s);
      setElemental(e);
      setFinalSummary(f);
      setWarnings(w);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Cost / m² data");
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!can("cost_per_m2", "view")) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-400">
        You don&apos;t have permission to view Cost / m² figures for this project.
      </div>
    );
  }

  if (!summary) return null;
  const { gfa } = summary;

  return (
    <div className="space-y-4">
      {/* §6.3/§9 firewall: data-quality warnings and the elemental cost
          breakdown are internal working detail, not part of the client-facing
          final summary — hidden from EXT-CLT/EXT-CON. The Final Cost Summary
          + mandatory footnote below remain visible to everyone with view
          access, since that IS the sell-basis figure clients are meant to see. */}
      {warnings.length > 0 && !isClientOrConsultant && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            {warnings.length} level{warnings.length !== 1 ? "s" : ""} with cost but no GFA entered
          </div>
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            {warnings.map((w) => (
              <li key={w.wbsNodeId}>{w.wbsName} — {money(w.cost)} committed, GFA not entered</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Building $/m² (blended)"
          value={rate(summary.blendedRate)}
          detail={`${money(summary.buildingCost)} ÷ ${gfa.gfaTotal.toLocaleString()} m² GFA total`}
          icon={Building2}
          tone="blue"
        />
        <MetricCard
          label="Above-ground $/m²"
          value={rate(summary.aboveGroundRate)}
          detail={`${money(summary.aboveGroundCost)} ÷ ${gfa.gfaAbove.toLocaleString()} m²`}
          icon={Layers}
        />
        <MetricCard
          label="Basement $/m²"
          value={rate(summary.basementRate)}
          detail={`${money(summary.basementCost)} ÷ ${gfa.gfaBasement.toLocaleString()} m²`}
          icon={Layers}
          tone={gfa.gfaBasement > 0 ? "emerald" : "slate"}
        />
        <MetricCard
          label="External $/m² (site)"
          value={rate(summary.externalWorksRate)}
          detail={summary.siteArea ? `${money(summary.externalWorksCost)} ÷ ${summary.siteArea.toLocaleString()} m² site` : "Site Area not entered"}
          icon={MapPin}
        />
      </div>

      {gfa.gfaBasement > 0 && (
        <p className="text-xs text-slate-500">
          Reported both split and blended, per house rule — never blended only. The above-ground building is {rate(summary.aboveGroundRate)} regardless of the basement.
        </p>
      )}

      {/* Elemental breakdown — internal working detail, not shown to clients/consultants */}
      {!isClientOrConsultant && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold text-slate-700">Elemental Breakdown (÷ GFA total)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-400">
                <th className="pb-2 font-medium">Element</th>
                <th className="pb-2 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">$/m²</th>
              </tr>
            </thead>
            <tbody>
              {elemental.length === 0 ? (
                <tr><td colSpan={3} className="py-4 text-center text-slate-400">No classified BOQ items yet</td></tr>
              ) : elemental.map((line) => (
                <tr key={line.category} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5">{ELEMENTAL_LABELS[line.category] ?? line.category}</td>
                  <td className="py-1.5 text-right">{money(line.cost)}</td>
                  <td className="py-1.5 text-right">{rate(line.costPerM2)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold">
                <td className="py-1.5">Building total</td>
                <td className="py-1.5 text-right">{money(summary.buildingCost)}</td>
                <td className="py-1.5 text-right">{rate(summary.blendedRate)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Standard Final Cost Summary — §9 mandatory format */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold text-slate-700">Standard Final Cost Summary</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-400">
              <th className="pb-2 font-medium">No.</th>
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium text-right">Cost (USD)</th>
              <th className="pb-2 font-medium text-right">Denominator</th>
              <th className="pb-2 font-medium text-right">$/m²</th>
            </tr>
          </thead>
          <tbody>
            {finalSummary.map((line) => (
              <tr
                key={line.no}
                className={cn(
                  "border-b border-slate-50 last:border-0",
                  (line.no === "A" || line.no === "B") && "font-semibold",
                  line.no === "memo" && "text-slate-400 italic",
                )}
              >
                <td className="py-1.5">{line.no}</td>
                <td className="py-1.5">{line.description}</td>
                <td className="py-1.5 text-right">{money(line.cost)}</td>
                <td className="py-1.5 text-right">{line.denominatorLabel}</td>
                <td className="py-1.5 text-right">{line.costPerM2 == null ? "—" : rate(line.costPerM2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-slate-400">
          Areas per DCOS-QS-GDL-001 §3 convention. Memo line is not a benchmark — see house reading notes (§9).
        </p>
      </section>

      <CostPerM2Footnote />
    </div>
  );
}

// Mandatory §5.1 basis footnote. Shared, always-on, never collapsible — any
// screen that surfaces a $/m² figure should reuse this exact component rather
// than re-typing the wording.
export function CostPerM2Footnote() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
      <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        &ldquo;$/m² per DCOS-QS-GDL-001 §5.1 house basis: incl. prelims &amp; OH&amp;P (sell); excl. VAT, land, fees, FF&amp;E, external works. Areas per §3 convention.&rdquo;
      </p>
    </div>
  );
}
