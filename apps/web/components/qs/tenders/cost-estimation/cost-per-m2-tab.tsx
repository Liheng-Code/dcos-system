"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Ruler } from "lucide-react";
import { toast } from "sonner";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { CostPerM2Footnote } from "@/components/qs/cost-per-m2-dashboard";
import {
  getTenderCostPerM2Summary, getTenderCostPerM2ByFloor,
  type TenderCostPerM2Summary, type FloorCostLine,
} from "@/lib/qs/tender-cost-service";
import { cn } from "@/lib/utils";

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(value);

const rate = (value: number | null) => value == null ? "—" : `$${value.toFixed(2)}/m²`;

function FloorRow({ line, isTotal }: { line: FloorCostLine; isTotal?: boolean }) {
  return (
    <tr className={cn(
      "border-b border-slate-100 last:border-0",
      isTotal && "border-t-2 border-slate-300 font-semibold bg-slate-50",
      !isTotal && !line.gfa && line.directCost === 0 && "text-muted-foreground",
    )}>
      <td className="py-2 px-4 text-sm font-medium">{line.levelCode}</td>
      <td className="py-2 px-4 text-sm text-muted-foreground">{line.wbsName ?? "—"}</td>
      <td className="py-2 px-4 text-right text-sm tabular-nums">{line.gfa != null ? `${line.gfa.toLocaleString()} m²` : "—"}</td>
      <td className="py-2 px-4 text-right text-sm tabular-nums">{money(line.directCost)}</td>
      <td className="py-2 px-4 text-right text-sm tabular-nums">{money(line.prelimsCost)}</td>
      <td className="py-2 px-4 text-right text-sm tabular-nums font-medium">{money(line.totalCost)}</td>
      <td className="py-2 px-4 text-right text-sm tabular-nums font-semibold text-primary">{rate(line.costPerM2)}</td>
    </tr>
  );
}

export function CostPerM2Tab({ tenderId }: { tenderId: string }) {
  const { can, loaded } = useQsPermissions();
  const [summary, setSummary] = useState<TenderCostPerM2Summary | null>(null);
  const [floorData, setFloorData] = useState<{ floors: FloorCostLine[]; unallocated: FloorCostLine | null; blendedTotal: FloorCostLine } | null>(null);
  const [loading, setLoading] = useState(true);
  const [floorExpanded, setFloorExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, f] = await Promise.all([
        getTenderCostPerM2Summary(tenderId),
        getTenderCostPerM2ByFloor(tenderId),
      ]);
      setSummary(s);
      setFloorData(f);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Cost($/m2) data");
    }
    setLoading(false);
  }, [tenderId]);

  useEffect(() => { void load(); }, [load]);

  if (!loaded || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!can("cost_per_m2", "view")) {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        You don&apos;t have permission to view Cost($/m2) figures for this tender.
      </div>
    );
  }

  if (!summary) return null;

  const hasFloors = floorData && floorData.floors.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold">Gross Floor Area (from WBS)</h3>
        {summary.gfaTotal != null ? (
          <p className="mt-1 text-2xl font-bold">{summary.gfaTotal.toLocaleString()} m²</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No GFA values found in WBS Preliminary level nodes.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{money(summary.directWorksTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Direct Works Total</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{money(summary.preliminariesTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Preliminaries Total</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{rate(summary.blendedRate)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Blended $/m² &mdash; {money(summary.combinedTotal)} ÷ {summary.gfaTotal?.toLocaleString() ?? "—"} m²
          </p>
        </div>
      </div>

      {hasFloors && (
        <section className="rounded-lg border border-border bg-white shadow-sm">
          <button
            onClick={() => setFloorExpanded(!floorExpanded)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
          >
            {floorExpanded
              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <h3 className="text-sm font-semibold">Cost Breakdown by Floor</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              {floorData.floors.length} level{floorData.floors.length !== 1 ? "s" : ""}
            </span>
          </button>

          {floorExpanded && (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Level</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium text-right">GFA (m²)</th>
                    <th className="px-4 py-2 font-medium text-right">Direct Cost</th>
                    <th className="px-4 py-2 font-medium text-right">Prelims</th>
                    <th className="px-4 py-2 font-medium text-right">Total Cost</th>
                    <th className="px-4 py-2 font-medium text-right">$/m²</th>
                  </tr>
                </thead>
                <tbody>
                  {floorData.floors.map((f) => (
                    <FloorRow key={f.levelCode} line={f} />
                  ))}
                  {floorData.unallocated && (
                    <FloorRow line={floorData.unallocated} />
                  )}
                  <FloorRow line={floorData.blendedTotal} isTotal />
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!hasFloors && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Tender-phase rate only: a single blended figure against total GFA. Tag BOQ items with floor levels and set WBS Preliminary GFA values to see the per-floor breakdown.
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        GFA sourced from WBS Preliminary level nodes. All WBS levels are listed. Prelims apportioned pro-rata by each floor&apos;s share of direct cost. Unallocated items (level &ldquo;All&rdquo;) shown separately.
      </p>

      <CostPerM2Footnote />
    </div>
  );
}
