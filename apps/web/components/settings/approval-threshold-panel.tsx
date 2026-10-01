"use client";

import { useEffect, useState } from "react";
import { listApprovalThresholds, upsertApprovalThresholds } from "@/lib/settings/settings-queries";
import { Loader2, ChevronDown, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Threshold {
  id: string;
  module: string;
  tier: string;
  min_amount: number | null;
  max_amount: number | null;
  approver_roles: string[];
}

const MODULE_LABELS: Record<string, string> = {
  procurement_pr: "Purchase Requisition",
  procurement_po: "Purchase Order",
  payment: "Payment / Invoice",
  variation_order: "Variation Order",
};

const TIER_LABELS: Record<string, string> = {
  tier_1: "Tier 1",
  tier_2: "Tier 2",
  tier_3: "Tier 3",
};

export function ApprovalThresholdPanel() {
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listApprovalThresholds().then(({ data }) => {
      if (data) setThresholds(data as Threshold[]);
      setLoading(false);
    });
  }, []);

  function updateThreshold(id: string, field: string, value: unknown) {
    setThresholds((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    );
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await upsertApprovalThresholds(thresholds.map((t) => ({
        id: t.id,
        module: t.module,
        tier: t.tier,
        min_amount: t.min_amount,
        max_amount: t.max_amount,
        approver_roles: t.approver_roles,
      })));
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Approval thresholds saved");
      setDirty(false);
    }
    setSaving(false);
  }

  if (loading) return null;

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Approval Thresholds
        <span className="ml-auto text-xs text-muted-foreground">{thresholds.length} tiers</span>
      </button>
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {thresholds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No thresholds configured</p>
          ) : (
            <>
              {Array.from(new Set(thresholds.map((t) => t.module))).map((mod) => (
                <div key={mod}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {MODULE_LABELS[mod] ?? mod.replace(/_/g, " ")}
                  </p>
                  <div className="space-y-2">
                    {thresholds
                      .filter((t) => t.module === mod)
                      .map((t) => (
                        <div key={t.id} className="flex items-center gap-3 text-sm">
                          <span className="w-16 text-muted-foreground">{TIER_LABELS[t.tier]}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">$</span>
                            <input
                              type="number"
                              value={t.min_amount ?? 0}
                              onChange={(e) => updateThreshold(t.id, "min_amount", Number(e.target.value))}
                              className="w-20 rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <input
                              type="number"
                              value={t.max_amount ?? ""}
                              placeholder="∞"
                              onChange={(e) => updateThreshold(t.id, "max_amount", e.target.value ? Number(e.target.value) : null)}
                              className="w-20 rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary"
                            />
                          </div>
                          <span className="text-xs text-muted-foreground ml-2">Approvers:</span>
                          <input
                            type="text"
                            value={t.approver_roles.join(", ")}
                            onChange={(e) =>
                              updateThreshold(
                                t.id,
                                "approver_roles",
                                e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              )
                            }
                            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-hidden focus:border-primary font-mono"
                            placeholder="L3, L2, L1"
                          />
                        </div>
                      ))}
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={!dirty || saving} size="sm" variant="outline">
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save Thresholds
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
