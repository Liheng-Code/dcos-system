"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  Loader2, Plus, Trash2, DollarSign, Eye, Pencil,
  CheckCircle2, XCircle, Clock, AlertTriangle, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SubmissionFormDialog } from "@/components/tenders/submissions/submission-form-dialog";

// ── Types ────────────────────────────────────────────────────────────────────

interface Tender {
  id: string;
  tender_no: string;
  title: string;
}

interface Submission {
  id: string;
  tender_id: string;
  invitation_id: string | null;
  bidder_name: string;
  submitted_date: string;
  bid_amount: number;
  currency: string;
  is_alternative: boolean;
  alternative_details: string | null;
  submission_status: string;
  documents_url: string | null;
  notes: string | null;
  created_at: string;
  tender_register?: { tender_no: string; title: string } | null;
}

interface SubmissionItem {
  id: string;
  item_code: string;
  description: string | null;
  unit: string;
  quantity: number;
  unit_rate: number;
  amount: number;
}

// ── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  submitted: { label: "Submitted", color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200", icon: <Clock className="h-3.5 w-3.5" /> },
  responsive: { label: "Responsive", color: "text-emerald-600", bgColor: "bg-emerald-50 border-emerald-200", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  non_responsive: { label: "Non-Responsive", color: "text-red-600", bgColor: "bg-red-50 border-red-200", icon: <XCircle className="h-3.5 w-3.5" /> },
  evaluated: { label: "Evaluated", color: "text-purple-600", bgColor: "bg-purple-50 border-purple-200", icon: <Eye className="h-3.5 w-3.5" /> },
  shortlisted: { label: "Shortlisted", color: "text-amber-600", bgColor: "bg-amber-50 border-amber-200", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  withdrawn: { label: "Withdrawn", color: "text-gray-600", bgColor: "bg-gray-50 border-gray-200", icon: <XCircle className="h-3.5 w-3.5" /> },
};

const STATUS_OPTIONS = ["submitted", "responsive", "non_responsive", "evaluated", "shortlisted", "withdrawn"];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SubmissionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<string>("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editSub, setEditSub] = useState<Submission | null>(null);

  // Detail view
  const [detailSub, setDetailSub] = useState<Submission | null>(null);
  const [detailItems, setDetailItems] = useState<SubmissionItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Sort
  const [sortField, setSortField] = useState<"submitted_date" | "bid_amount" | "bidder_name">("submitted_date");
  const [sortAsc, setSortAsc] = useState(false);

  // Fetch tenders for project
  useEffect(() => {
    let q = supabase.from("tender_register").select("id,tender_no,title").order("created_at", { ascending: false });
    if (selectedProjectId) q = q.eq("project_id", selectedProjectId);
    q.then(({ data }) => {
      if (data) setTenders(data);
      setLoading(false);
    });
  }, [supabase, selectedProjectId]);

  // Fetch submissions for selected tender
  useEffect(() => {
    if (!selectedTenderId) return;
    void (async () => {
      setLoadingSubs(true);
      const { data } = await supabase
        .from("tender_submissions")
        .select("*, tender_register!inner(tender_no, title)")
        .eq("tender_id", selectedTenderId)
        .order("submitted_date", { ascending: false });
      setSubmissions((data as Submission[]) ?? []);
      setLoadingSubs(false);
    })();
  }, [selectedTenderId, supabase]);

  // Sorted submissions
  const sortedSubs = useMemo(() => {
    const arr = [...submissions];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortField === "bidder_name") cmp = a.bidder_name.localeCompare(b.bidder_name);
      else if (sortField === "bid_amount") cmp = a.bid_amount - b.bid_amount;
      else cmp = new Date(a.submitted_date).getTime() - new Date(b.submitted_date).getTime();
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [submissions, sortField, sortAsc]);

  // KPIs
  const kpis = useMemo(() => ({
    total: submissions.length,
    responsive: submissions.filter((s) => s.submission_status === "responsive").length,
    evaluated: submissions.filter((s) => ["evaluated", "shortlisted"].includes(s.submission_status)).length,
    totalValue: submissions.reduce((sum, s) => sum + Number(s.bid_amount ?? 0), 0),
    lowest: submissions.length > 0 ? Math.min(...submissions.map((s) => Number(s.bid_amount ?? 0)).filter((v) => v > 0)) : 0,
    highest: submissions.length > 0 ? Math.max(...submissions.map((s) => Number(s.bid_amount ?? 0))) : 0,
  }), [submissions]);

  // Load detail items
  async function loadDetail(sub: Submission) {
    setDetailSub(sub);
    setLoadingDetail(true);
    const { data } = await supabase
      .from("tender_submission_items")
      .select("*")
      .eq("submission_id", sub.id)
      .order("item_code");
    setDetailItems((data as SubmissionItem[]) ?? []);
    setLoadingDetail(false);
  }

  // Quick status update
  async function updateStatus(subId: string, newStatus: string) {
    const { error } = await supabase
      .from("tender_submissions")
      .update({ submission_status: newStatus })
      .eq("id", subId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmissions((prev) => prev.map((s) => s.id === subId ? { ...s, submission_status: newStatus } : s));
    if (detailSub?.id === subId) setDetailSub((prev) => prev ? { ...prev, submission_status: newStatus } : prev);
    toast.success(`Status updated to ${newStatus}`);
  }

  // Delete submission
  async function deleteSubmission(subId: string) {
    setDeletingId(subId);
    const { error } = await supabase.from("tender_submissions").delete().eq("id", subId);
    if (error) {
      toast.error(error.message);
      setDeletingId(null);
      return;
    }
    setSubmissions((prev) => prev.filter((s) => s.id !== subId));
    if (detailSub?.id === subId) setDetailSub(null);
    toast.success("Submission deleted");
    setDeletingId(null);
  }

  function handleSaved() {
    setShowForm(false);
    setEditSub(null);
    // Re-fetch submissions
    if (selectedTenderId) {
      supabase
        .from("tender_submissions")
        .select("*, tender_register!inner(tender_no, title)")
        .eq("tender_id", selectedTenderId)
        .order("submitted_date", { ascending: false })
        .then(({ data }) => {
          setSubmissions((data as Submission[]) ?? []);
        });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
        <p className="text-sm text-muted-foreground">Bidder submissions and pricing — manage bids received for each tender</p>
      </div>

      {/* Tender Selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium shrink-0">Select Tender:</label>
        <select
          value={selectedTenderId}
          onChange={(e) => { setSelectedTenderId(e.target.value); setDetailSub(null); }}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-md"
        >
          <option value="">Choose a tender...</option>
          {tenders.map((t) => (
            <option key={t.id} value={t.id}>{t.tender_no} — {t.title}</option>
          ))}
        </select>
        {selectedTenderId && (
          <Button size="sm" onClick={() => { setEditSub(null); setShowForm(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New Submission
          </Button>
        )}
      </div>

      {selectedTenderId ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Total" value={kpis.total.toString()} icon={<DollarSign className="h-4 w-4" />} color="text-blue-600 bg-blue-50" />
            <KpiCard label="Responsive" value={kpis.responsive.toString()} icon={<CheckCircle2 className="h-4 w-4" />} color="text-emerald-600 bg-emerald-50" />
            <KpiCard label="Evaluated" value={kpis.evaluated.toString()} icon={<Eye className="h-4 w-4" />} color="text-purple-600 bg-purple-50" />
            <KpiCard label="Total Value" value={`$${kpis.totalValue.toLocaleString()}`} icon={<DollarSign className="h-4 w-4" />} color="text-amber-600 bg-amber-50" />
            <KpiCard label="Lowest Bid" value={kpis.lowest > 0 ? `$${kpis.lowest.toLocaleString()}` : "—"} icon={<ArrowUpDown className="h-4 w-4" />} color="text-cyan-600 bg-cyan-50" />
            <KpiCard label="Highest Bid" value={kpis.highest > 0 ? `$${kpis.highest.toLocaleString()}` : "—"} icon={<ArrowUpDown className="h-4 w-4" />} color="text-rose-600 bg-rose-50" />
          </div>

          <div className="flex gap-6">
            {/* Submission List */}
            <div className={cn("flex-1 min-w-0", detailSub && "lg:max-w-md")}>
              {/* Sort controls */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Sort by:</span>
                {([["submitted_date", "Date"], ["bid_amount", "Amount"], ["bidder_name", "Name"]] as const).map(([field, label]) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => { if (sortField === field) setSortAsc(!sortAsc); else { setSortField(field); setSortAsc(false); } }}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md border transition-colors",
                      sortField === field ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label} {sortField === field ? (sortAsc ? "↑" : "↓") : ""}
                  </button>
                ))}
              </div>

              {loadingSubs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sortedSubs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
                  <DollarSign className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No submissions received yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click &quot;New Submission&quot; to record a bidder&apos;s proposal</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedSubs.map((sub) => {
                    const sc = STATUS_CONFIG[sub.submission_status] ?? STATUS_CONFIG.submitted;
                    const isSelected = detailSub?.id === sub.id;
                    return (
                      <div
                        key={sub.id}
                        className={cn(
                          "rounded-lg border p-3 transition-all cursor-pointer",
                          isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:shadow-sm",
                        )}
                        onClick={() => loadDetail(sub)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold", sc.bgColor, sc.color)}>
                            {sub.bidder_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">{sub.bidder_name}</p>
                              {sub.is_alternative && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">ALT</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(sub.submitted_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold font-mono">${Number(sub.bid_amount).toLocaleString()}</p>
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", sc.color)}>
                              {sc.icon} {sc.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Detail Panel */}
            {detailSub && (
              <div className="hidden lg:block w-96 shrink-0">
                <div className="rounded-xl border border-border bg-card sticky top-4">
                  {/* Detail Header */}
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold truncate">{detailSub.bidder_name}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setEditSub(detailSub); setShowForm(true); }}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailSub(null)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-3 space-y-3">
                    {/* Status Quick Change */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Status</label>
                      <select
                        value={detailSub.submission_status}
                        onChange={(e) => updateStatus(detailSub.id, e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
                        ))}
                      </select>
                    </div>

                    {/* Summary */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Bid Amount</span>
                        <span className="font-bold font-mono">${Number(detailSub.bid_amount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Currency</span>
                        <span className="font-medium">{detailSub.currency}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Submitted</span>
                        <span className="font-medium">{new Date(detailSub.submitted_date).toLocaleDateString()}</span>
                      </div>
                      {detailSub.is_alternative && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Alternative</span>
                          <span className="text-amber-600 font-medium">Yes</span>
                        </div>
                      )}
                    </div>

                    {detailSub.alternative_details && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-medium text-amber-800 mb-1">Alternative Details</p>
                        <p className="text-xs text-amber-700">{detailSub.alternative_details}</p>
                      </div>
                    )}

                    {detailSub.notes && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                        <p className="text-xs text-muted-foreground">{detailSub.notes}</p>
                      </div>
                    )}

                    {/* Pricing Items */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Pricing Items</p>
                      {loadingDetail ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : detailItems.length > 0 ? (
                        <div className="rounded-lg border border-border overflow-hidden max-h-60 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border bg-muted/50">
                                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Code</th>
                                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Qty</th>
                                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Rate</th>
                                <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {detailItems.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-2 py-1.5 font-mono">{item.item_code}</td>
                                  <td className="px-2 py-1.5 text-right">{item.quantity}</td>
                                  <td className="px-2 py-1.5 text-right">${item.unit_rate.toLocaleString()}</td>
                                  <td className="px-2 py-1.5 text-right font-medium">${item.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No line items</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => { setEditSub(detailSub); setShowForm(true); }}
                      >
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deleteSubmission(detailSub.id)}
                        disabled={deletingId === detailSub.id}
                      >
                        {deletingId === detailSub.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-border px-6 py-16 text-center text-sm text-muted-foreground">
          <DollarSign className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
          <p>Select a tender above to view and manage submissions</p>
        </div>
      )}

      {/* Form Dialog */}
      {showForm && (
        <SubmissionFormDialog
          tenderId={selectedTenderId}
          tenderNo={tenders.find((t) => t.id === selectedTenderId)?.tender_no ?? ""}
          onClose={() => { setShowForm(false); setEditSub(null); }}
          onSaved={handleSaved}
          editSubmission={editSub}
        />
      )}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon, color,
}: {
  label: string; value: string; icon: React.ReactNode; color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", color)}>
          {icon}
        </div>
        <div>
          <p className="text-lg font-bold">{value}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
