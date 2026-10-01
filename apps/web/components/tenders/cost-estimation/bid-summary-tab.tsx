"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getBidSummaries, createBidSummaryRevision, updateBidSummary, deleteBidSummary, recalculateBidSummaryFromBoq,
  type TenderBidSummary,
} from "@/lib/qs/tender-cost-service";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BidSummaryTab({ tenderId }: { tenderId: string }) {
  const [summaries, setSummaries] = useState<TenderBidSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  const { can } = useTenderPermissions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummaries(await getBidSummaries(tenderId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load bid summaries");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      await createBidSummaryRevision(tenderId);
      toast.success("Bid summary revision created");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create revision");
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalculate(id: string) {
    setRecalculatingId(id);
    try {
      await recalculateBidSummaryFromBoq(tenderId, id);
      toast.success("Direct Works & Preliminaries recalculated from BOQ");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculation failed");
    } finally {
      setRecalculatingId(null);
    }
  }

  async function handleSave(id: string) {
    const form = editForm[id];
    if (!form) return;
    setSaving(true);
    try {
      await updateBidSummary(id, {
        direct_cost: parseFloat(form.direct_cost) || 0,
        preliminaries: parseFloat(form.preliminaries) || 0,
        subcontract_cost: parseFloat(form.subcontract_cost) || 0,
        overhead_pct: parseFloat(form.overhead_pct) || 0,
        profit_pct: parseFloat(form.profit_pct) || 0,
        contingency: parseFloat(form.contingency) || 0,
        risk_allowance: parseFloat(form.risk_allowance) || 0,
        vat_pct: parseFloat(form.vat_pct) || 0,
        status: form.status,
        notes: form.notes || null,
      });
      toast.success("Bid summary updated");
      setEditingId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bid summary revision?")) return;
    setDeletingId(id);
    try {
      await deleteBidSummary(id);
      toast.success("Bid summary deleted");
      setSummaries((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted-foreground">Bid Summaries</p>
        {can("tender_bid_summary", "can_create") && (
        <Button size="sm" variant="outline" onClick={handleCreate} disabled={saving}>
          <Plus className="mr-1 h-4 w-4" /> New Revision
        </Button>
        )}
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No bid summaries</div>
      ) : (
        <div className="space-y-2">
          {summaries.map((bs) => (
            <Card key={bs.id}>
              <CardContent className="p-4">
                {editingId === bs.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      {([
                        ["direct_cost", "Direct Cost"], ["preliminaries", "Preliminaries"], ["subcontract_cost", "Subcontract Cost"],
                        ["overhead_pct", "Overhead %"], ["profit_pct", "Profit %"], ["contingency", "Contingency"],
                        ["risk_allowance", "Risk Allowance"], ["vat_pct", "VAT %"],
                      ] as const).map(([key, label]) => (
                        <div key={key} className="space-y-1">
                          <label className="text-xs">{label}</label>
                          <input
                            type="number"
                            value={editForm[bs.id]?.[key] ?? (bs as unknown as Record<string, unknown>)[key] as number}
                            onChange={(e) => setEditForm({ ...editForm, [bs.id]: { ...editForm[bs.id], [key]: e.target.value } })}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                          />
                        </div>
                      ))}
                      <div className="space-y-1">
                        <label className="text-xs">Status</label>
                        <select
                          value={editForm[bs.id]?.status ?? bs.status}
                          onChange={(e) => setEditForm({ ...editForm, [bs.id]: { ...editForm[bs.id], status: e.target.value } })}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                        >
                          <option value="draft">Draft</option><option value="review">Review</option><option value="final">Final</option><option value="submitted">Submitted</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleSave(bs.id)} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">Revision {bs.revision_no} — {bs.status}</p>
                        <button onClick={() => handleRecalculate(bs.id)} className="text-muted-foreground hover:text-foreground" title="Recalculate Direct Works & Preliminaries from BOQ" disabled={recalculatingId === bs.id}>
                          {recalculatingId === bs.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </button>
                        {can("tender_bid_summary", "submit") && (
                        <button onClick={() => { setEditingId(bs.id); setEditForm({ ...editForm, [bs.id]: {} }); }} className="text-muted-foreground hover:text-foreground"><Save className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => handleDelete(bs.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === bs.id}>
                          {deletingId === bs.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-lg font-bold">${fmt(bs.total_bid_price)}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-muted/50 rounded px-2 py-1">Direct: ${fmt(bs.direct_cost)}</div>
                      <div className="bg-muted/50 rounded px-2 py-1">Prelims: ${fmt(bs.preliminaries)}</div>
                      <div className="bg-muted/50 rounded px-2 py-1">Overhead: {bs.overhead_pct}% (${fmt(bs.overhead_amount)})</div>
                      <div className="bg-muted/50 rounded px-2 py-1">Profit: {bs.profit_pct}% (${fmt(bs.profit_amount)})</div>
                      <div className="bg-muted/50 rounded px-2 py-1">Contingency: ${fmt(bs.contingency)}</div>
                      <div className="bg-muted/50 rounded px-2 py-1">Risk: ${fmt(bs.risk_allowance)}</div>
                      <div className="bg-muted/50 rounded px-2 py-1">VAT: {bs.vat_pct}% (${fmt(bs.vat_amount)})</div>
                      <div className="bg-muted/50 rounded px-2 py-1">Subcon: ${fmt(bs.subcontract_cost)}</div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
