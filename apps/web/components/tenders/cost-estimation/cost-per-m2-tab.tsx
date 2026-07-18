"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Ruler } from "lucide-react";
import { toast } from "sonner";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { CostPerM2Footnote } from "@/components/qs/cost-per-m2-dashboard";
import {
  getTenderCostPerM2Summary, getTenderGfa, updateTenderGfa,
  type TenderCostPerM2Summary,
} from "@/lib/tender-cost-service";

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(value);

const rate = (value: number | null) => value == null ? "—" : `$${value.toFixed(2)}/m²`;

export function CostPerM2Tab({ tenderId }: { tenderId: string }) {
  const { can, loaded, isClientOrConsultant } = useQsPermissions();
  const [summary, setSummary] = useState<TenderCostPerM2Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [gfaInput, setGfaInput] = useState("");
  const [sourceInput, setSourceInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getTenderCostPerM2Summary(tenderId);
      setSummary(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Cost / m² data");
    }
    setLoading(false);
  }, [tenderId]);

  useEffect(() => { void load(); }, [load]);

  function openEdit() {
    setGfaInput(summary?.gfaTotal != null ? String(summary.gfaTotal) : "");
    setSourceInput("");
    setEditing(true);
  }

  async function saveGfa() {
    const value = Number(gfaInput);
    if (!gfaInput || Number.isNaN(value) || value < 0) {
      toast.error("Enter a valid GFA value");
      return;
    }
    if (!sourceInput.trim()) {
      toast.error("Drawing/document reference is required (GFA is entered, never derived)");
      return;
    }
    setSaving(true);
    try {
      await updateTenderGfa(tenderId, { gfaTotal: value, gfaSource: sourceInput.trim() });
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save GFA");
    }
    setSaving(false);
  }

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
        You don&apos;t have permission to view Cost / m² figures for this tender.
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Gross Floor Area</h3>
          {!isClientOrConsultant && (
            <button onClick={openEdit} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Pencil className="h-3 w-3" /> {summary.gfaTotal != null ? "Edit" : "Enter GFA"}
            </button>
          )}
        </div>
        {summary.gfaTotal != null ? (
          <p className="mt-1 text-2xl font-bold">{summary.gfaTotal.toLocaleString()} m²</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Not entered yet — blended $/m² cannot be computed.</p>
        )}
      </div>

      {editing && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">GFA (m²)</label>
            <input
              type="number" min="0" step="0.01" value={gfaInput}
              onChange={(e) => setGfaInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Drawing / document reference</label>
            <input
              value={sourceInput} onChange={(e) => setSourceInput(e.target.value)}
              placeholder="e.g. A-101 Rev B"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={saveGfa} disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-border px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

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

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Tender-phase rate only: a single blended figure against total GFA, since the tender BOQ isn&apos;t split by WBS level or elemental category yet. See the Cost Control &rarr; Cost / m² tab post-award for the full split view.
      </p>

      <CostPerM2Footnote />
    </div>
  );
}
