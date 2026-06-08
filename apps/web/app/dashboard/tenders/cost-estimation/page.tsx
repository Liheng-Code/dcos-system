"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Calculator, Plus, DollarSign, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "boq" | "rates" | "subquotes" | "risks" | "bid";

export default function CostEstimationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [tenders, setTenders] = useState<{id:string,tender_no:string,title:string}[]>([]);
  const [tab, setTab] = useState<Tab>("bid");
  const [loading, setLoading] = useState(true);

  const [bidSummaries, setBidSummaries] = useState<any[]>([]);
  const [unitRates, setUnitRates] = useState<any[]>([]);
  const [subQuotes, setSubQuotes] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [boqItems, setBoqItems] = useState<any[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // BOQ form
  const [showBoqForm, setShowBoqForm] = useState(false);
  const [boqForm, setBoqForm] = useState({ section: "", item_code: "", description: "", unit: "ea", quantity: "0", unit_rate: "0" });

  // Rates form
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateForm, setRateForm] = useState({ code: "", description: "", category: "material", trade: "", unit: "ea", base_rate: "0", wastage_pct: "0", productivity_factor: "1", notes: "" });

  // Sub quote form
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ company_name: "", trade: "", quote_amount: "0", currency: "USD", scope_of_work: "", received_date: new Date().toISOString().split("T")[0], valid_until: "", is_preferred: false });

  // Risk form
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskForm, setRiskForm] = useState({ risk_no: "", description: "", category: "technical", likelihood: "medium", impact: "medium", priced_amount: "0", mitigation: "", owner: "" });

  // Bid summary edit
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const [bidEditForm, setBidEditForm] = useState<any>({});

  useEffect(() => {
    supabase.from("tender_register").select("id,tender_no,title").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setTenders(data);
      setLoading(false);
    });
  }, [supabase]);

  function loadData(tenderId: string) {
    setSelectedTenderId(tenderId);
    if (!tenderId) return;
    Promise.all([
      supabase.from("tender_bid_summaries").select("*").eq("tender_id", tenderId).order("revision_no", { ascending: false }),
      supabase.from("unit_rate_library").select("*").order("category"),
      supabase.from("tender_sub_quotes").select("*").eq("tender_id", tenderId),
      supabase.from("tender_risk_items").select("*").eq("tender_id", tenderId),
      supabase.from("tender_boq_items").select("*").eq("tender_id", tenderId).order("section"),
    ]).then(([b, u, q, r, boq]) => {
      if (b.data) setBidSummaries(b.data);
      if (u.data) setUnitRates(u.data);
      if (q.data) setSubQuotes(q.data);
      if (r.data) setRisks(r.data);
      if (boq.data) setBoqItems(boq.data);
    });
  }

  // ── BOQ CRUD ───────────────────────────────────────────────────────────────────

  async function handleCreateBoq() {
    if (!selectedTenderId) return;
    setSaving(true);
    const qty = parseFloat(boqForm.quantity) || 0;
    const rate = parseFloat(boqForm.unit_rate) || 0;
    const { error } = await supabase.from("tender_boq_items").insert({
      tender_id: selectedTenderId, section: boqForm.section, item_code: boqForm.item_code,
      description: boqForm.description, unit: boqForm.unit, quantity: qty, unit_rate: rate,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("BOQ item added");
    setShowBoqForm(false);
    setBoqForm({ section: "", item_code: "", description: "", unit: "ea", quantity: "0", unit_rate: "0" });
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteBoq(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("tender_boq_items").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("BOQ item deleted");
    setBoqItems(boqItems.filter((i: any) => i.id !== id));
    setDeletingId(null);
  }

  // ── Unit Rate CRUD ─────────────────────────────────────────────────────────────

  async function handleCreateRate() {
    setSaving(true);
    const { error } = await supabase.from("unit_rate_library").insert({
      code: rateForm.code, description: rateForm.description, category: rateForm.category,
      trade: rateForm.trade || null, unit: rateForm.unit, base_rate: parseFloat(rateForm.base_rate) || 0,
      wastage_pct: parseFloat(rateForm.wastage_pct) || 0,
      productivity_factor: parseFloat(rateForm.productivity_factor) || 1,
      notes: rateForm.notes || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Unit rate added");
    setShowRateForm(false);
    setRateForm({ code: "", description: "", category: "material", trade: "", unit: "ea", base_rate: "0", wastage_pct: "0", productivity_factor: "1", notes: "" });
    const { data } = await supabase.from("unit_rate_library").select("*").order("category");
    if (data) setUnitRates(data);
    setSaving(false);
  }

  async function handleDeleteRate(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("unit_rate_library").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Rate deleted");
    setUnitRates(unitRates.filter((r: any) => r.id !== id));
    setDeletingId(null);
  }

  // ── Sub Quote CRUD ─────────────────────────────────────────────────────────────

  async function handleCreateQuote() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await supabase.from("tender_sub_quotes").insert({
      tender_id: selectedTenderId, company_name: quoteForm.company_name, trade: quoteForm.trade,
      quote_amount: parseFloat(quoteForm.quote_amount) || 0, currency: quoteForm.currency,
      scope_of_work: quoteForm.scope_of_work || null,
      received_date: quoteForm.received_date, valid_until: quoteForm.valid_until || null,
      is_preferred: quoteForm.is_preferred,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Sub quote added");
    setShowQuoteForm(false);
    setQuoteForm({ company_name: "", trade: "", quote_amount: "0", currency: "USD", scope_of_work: "", received_date: new Date().toISOString().split("T")[0], valid_until: "", is_preferred: false });
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteQuote(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("tender_sub_quotes").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Quote deleted");
    setSubQuotes(subQuotes.filter((q: any) => q.id !== id));
    setDeletingId(null);
  }

  // ── Risk CRUD ──────────────────────────────────────────────────────────────────

  async function handleCreateRisk() {
    if (!selectedTenderId) return;
    setSaving(true);
    const { error } = await supabase.from("tender_risk_items").insert({
      tender_id: selectedTenderId, risk_no: riskForm.risk_no, description: riskForm.description,
      category: riskForm.category, likelihood: riskForm.likelihood, impact: riskForm.impact,
      priced_amount: parseFloat(riskForm.priced_amount) || 0,
      mitigation: riskForm.mitigation || null, owner: riskForm.owner || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Risk item added");
    setShowRiskForm(false);
    setRiskForm({ risk_no: "", description: "", category: "technical", likelihood: "medium", impact: "medium", priced_amount: "0", mitigation: "", owner: "" });
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteRisk(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("tender_risk_items").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Risk deleted");
    setRisks(risks.filter((r: any) => r.id !== id));
    setDeletingId(null);
  }

  // ── Bid Summary CRUD ───────────────────────────────────────────────────────────

  async function handleCreateBidSummary() {
    if (!selectedTenderId) return;
    setSaving(true);
    const nextRev = bidSummaries.length + 1;
    const { error } = await supabase.from("tender_bid_summaries").insert({
      tender_id: selectedTenderId, revision_no: nextRev, direct_cost: 0, overhead_pct: 10, profit_pct: 5,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Bid summary created");
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleUpdateBidSummary(id: string) {
    const form = bidEditForm[id];
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("tender_bid_summaries").update({
      direct_cost: parseFloat(form.direct_cost) || 0,
      preliminaries: parseFloat(form.preliminaries) || 0,
      subcontract_cost: parseFloat(form.subcontract_cost) || 0,
      overhead_pct: parseFloat(form.overhead_pct) || 0,
      profit_pct: parseFloat(form.profit_pct) || 0,
      contingency: parseFloat(form.contingency) || 0,
      risk_allowance: parseFloat(form.risk_allowance) || 0,
      status: form.status,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Bid summary updated");
    setEditingBidId(null);
    loadData(selectedTenderId);
    setSaving(false);
  }

  async function handleDeleteBidSummary(id: string) {
    if (!confirm("Delete this bid summary revision?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("tender_bid_summaries").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Bid summary deleted");
    setBidSummaries(bidSummaries.filter((b: any) => b.id !== id));
    setDeletingId(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cost Estimation</h1>
        <p className="text-sm text-muted-foreground">Tender BOQ, unit rates, sub-quotes, risk pricing, and bid build-up</p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium shrink-0">Select Tender:</label>
        <select value={selectedTenderId} onChange={(e) => loadData(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-md">
          <option value="">Choose a tender...</option>
          {tenders.map((t) => (<option key={t.id} value={t.id}>{t.tender_no} — {t.title}</option>))}
        </select>
      </div>

      {selectedTenderId && (
        <>
          <div className="flex gap-1 border-b border-border">
            {(["bid","boq","rates","subquotes","risks"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}>
                {t === "bid" ? "Bid Summary" : t === "boq" ? "Tender BOQ" : t === "rates" ? "Unit Rates" : t === "subquotes" ? "Sub Quotes" : "Risk Items"}
              </button>
            ))}
          </div>

          {/* ── BID SUMMARY TAB ── */}
          {tab === "bid" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Bid Summaries</p>
                <Button size="sm" variant="outline" onClick={handleCreateBidSummary} disabled={saving}>
                  <Plus className="mr-1 h-4 w-4" /> New Revision
                </Button>
              </div>
              {bidSummaries.length === 0 ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No bid summaries</div>
              ) : (
                <div className="space-y-2">
                  {bidSummaries.map((bs) => (
                    <Card key={bs.id}>
                      <CardContent className="p-4">
                        {editingBidId === bs.id ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                              <div className="space-y-1"><label className="text-xs">Direct Cost</label><input type="number" value={bidEditForm[bs.id]?.direct_cost ?? bs.direct_cost} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], direct_cost: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" /></div>
                              <div className="space-y-1"><label className="text-xs">Preliminaries</label><input type="number" value={bidEditForm[bs.id]?.preliminaries ?? bs.preliminaries} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], preliminaries: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" /></div>
                              <div className="space-y-1"><label className="text-xs">Subcontract Cost</label><input type="number" value={bidEditForm[bs.id]?.subcontract_cost ?? bs.subcontract_cost} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], subcontract_cost: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" /></div>
                              <div className="space-y-1"><label className="text-xs">Overhead %</label><input type="number" value={bidEditForm[bs.id]?.overhead_pct ?? bs.overhead_pct} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], overhead_pct: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" /></div>
                              <div className="space-y-1"><label className="text-xs">Profit %</label><input type="number" value={bidEditForm[bs.id]?.profit_pct ?? bs.profit_pct} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], profit_pct: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" /></div>
                              <div className="space-y-1"><label className="text-xs">Contingency</label><input type="number" value={bidEditForm[bs.id]?.contingency ?? bs.contingency} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], contingency: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" /></div>
                              <div className="space-y-1"><label className="text-xs">Risk Allowance</label><input type="number" value={bidEditForm[bs.id]?.risk_allowance ?? bs.risk_allowance} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], risk_allowance: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" /></div>
                              <div className="space-y-1"><label className="text-xs">Status</label><select value={bidEditForm[bs.id]?.status ?? bs.status} onChange={e => setBidEditForm({...bidEditForm, [bs.id]: {...bidEditForm[bs.id], status: e.target.value}})} className="w-full rounded border border-border bg-background px-2 py-1 text-sm">
                                <option value="draft">Draft</option><option value="review">Review</option><option value="final">Final</option><option value="submitted">Submitted</option>
                              </select></div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => setEditingBidId(null)}>Cancel</Button>
                              <Button size="sm" onClick={() => handleUpdateBidSummary(bs.id)} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold">Revision {bs.revision_no} — {bs.status}</p>
                                <button onClick={() => { setEditingBidId(bs.id); setBidEditForm({...bidEditForm, [bs.id]: {}}); }} className="text-muted-foreground hover:text-foreground"><Save className="h-3.5 w-3.5" /></button>
                                <button onClick={() => handleDeleteBidSummary(bs.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === bs.id}>
                                  {deletingId === bs.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                              <p className="text-lg font-bold">${Number(bs.total_bid_price).toLocaleString()}</p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div className="bg-muted/50 rounded px-2 py-1">Direct: ${Number(bs.direct_cost).toLocaleString()}</div>
                              <div className="bg-muted/50 rounded px-2 py-1">Overhead: {bs.overhead_pct}%</div>
                              <div className="bg-muted/50 rounded px-2 py-1">Profit: {bs.profit_pct}%</div>
                              <div className="bg-muted/50 rounded px-2 py-1">Subcon: ${Number(bs.subcontract_cost || 0).toLocaleString()}</div>
                              <div className="bg-muted/50 rounded px-2 py-1">Contingency: ${Number(bs.contingency || 0).toLocaleString()}</div>
                              <div className="bg-muted/50 rounded px-2 py-1">Risk: ${Number(bs.risk_allowance || 0).toLocaleString()}</div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── BOQ TAB ── */}
          {tab === "boq" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{boqItems.length} item{boqItems.length !== 1 ? "s" : ""}</p>
                <Button size="sm" variant="outline" onClick={() => setShowBoqForm(!showBoqForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Item
                </Button>
              </div>

              {showBoqForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="text-xs font-medium">Section *</label><input value={boqForm.section} onChange={e => setBoqForm({...boqForm, section: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Item Code *</label><input value={boqForm.item_code} onChange={e => setBoqForm({...boqForm, item_code: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><input value={boqForm.description} onChange={e => setBoqForm({...boqForm, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Unit</label><select value={boqForm.unit} onChange={e => setBoqForm({...boqForm, unit: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="ea">Each</option><option value="m">Metre</option><option value="m2">Sq Metre</option><option value="m3">Cu Metre</option><option value="kg">Kg</option><option value="ton">Ton</option><option value="hr">Hour</option><option value="day">Day</option><option value="lot">Lot</option><option value="ls">Lump Sum</option>
                      </select></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Quantity</label><input type="number" value={boqForm.quantity} onChange={e => setBoqForm({...boqForm, quantity: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Unit Rate</label><input type="number" value={boqForm.unit_rate} onChange={e => setBoqForm({...boqForm, unit_rate: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Total</label><p className="pt-2 text-sm font-semibold">{((parseFloat(boqForm.quantity) || 0) * (parseFloat(boqForm.unit_rate) || 0)).toLocaleString()}</p></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowBoqForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateBoq} disabled={saving || !boqForm.item_code.trim() || !boqForm.description.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {boqItems.length === 0 && !showBoqForm ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No BOQ items added</div>
              ) : boqItems.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Section</th>
                        <th className="text-left px-3 py-2 font-medium">Code</th>
                        <th className="text-left px-3 py-2 font-medium">Description</th>
                        <th className="text-right px-3 py-2 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 font-medium">Rate</th>
                        <th className="text-right px-3 py-2 font-medium">Amount</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {boqItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.section}</td>
                          <td className="px-3 py-2 font-mono text-xs">{item.item_code}</td>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-right">{Number(item.quantity).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">${Number(item.unit_rate).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold">${Number(item.total_amount).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => handleDeleteBoq(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                              {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── UNIT RATES TAB ── */}
          {tab === "rates" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{unitRates.length} rate{unitRates.length !== 1 ? "s" : ""}</p>
                <Button size="sm" variant="outline" onClick={() => setShowRateForm(!showRateForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Rate
                </Button>
              </div>

              {showRateForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="text-xs font-medium">Code *</label><input value={rateForm.code} onChange={e => setRateForm({...rateForm, code: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Category</label><select value={rateForm.category} onChange={e => setRateForm({...rateForm, category: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="labour">Labour</option><option value="material">Material</option><option value="plant">Plant</option>
                        <option value="subcontract">Subcontract</option><option value="preliminaries">Preliminaries</option>
                        <option value="overhead">Overhead</option><option value="profit">Profit</option>
                      </select></div>
                      <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><input value={rateForm.description} onChange={e => setRateForm({...rateForm, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Trade</label><input value={rateForm.trade} onChange={e => setRateForm({...rateForm, trade: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Unit</label><select value={rateForm.unit} onChange={e => setRateForm({...rateForm, unit: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="ea">Each</option><option value="m">Metre</option><option value="m2">Sq Metre</option><option value="m3">Cu Metre</option><option value="kg">Kg</option><option value="ton">Ton</option><option value="hr">Hour</option><option value="day">Day</option>
                      </select></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Base Rate *</label><input type="number" value={rateForm.base_rate} onChange={e => setRateForm({...rateForm, base_rate: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Wastage %</label><input type="number" value={rateForm.wastage_pct} onChange={e => setRateForm({...rateForm, wastage_pct: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Productivity Factor</label><input type="number" step="0.01" value={rateForm.productivity_factor} onChange={e => setRateForm({...rateForm, productivity_factor: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Notes</label><textarea value={rateForm.notes} onChange={e => setRateForm({...rateForm, notes: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowRateForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateRate} disabled={saving || !rateForm.code.trim() || !rateForm.description.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {unitRates.length === 0 && !showRateForm ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No unit rates in library</div>
              ) : (
                unitRates.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      r.category === "labour" ? "bg-blue-50 text-blue-600" :
                      r.category === "material" ? "bg-amber-50 text-amber-600" :
                      r.category === "plant" ? "bg-purple-50 text-purple-600" : "bg-gray-50 text-gray-600"
                    )}>{r.category}</span>
                    <span className="font-mono text-xs">{r.code}</span>
                    <span className="flex-1 truncate">{r.description}</span>
                    <span className="font-semibold">${Number(r.base_rate).toLocaleString()}/{r.unit}</span>
                    <button onClick={() => handleDeleteRate(r.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === r.id}>
                      {deletingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── SUB QUOTES TAB ── */}
          {tab === "subquotes" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{subQuotes.length} quote{subQuotes.length !== 1 ? "s" : ""}</p>
                <Button size="sm" variant="outline" onClick={() => setShowQuoteForm(!showQuoteForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Quote
                </Button>
              </div>

              {showQuoteForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="text-xs font-medium">Company *</label><input value={quoteForm.company_name} onChange={e => setQuoteForm({...quoteForm, company_name: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Trade *</label><input value={quoteForm.trade} onChange={e => setQuoteForm({...quoteForm, trade: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Quote Amount *</label><input type="number" value={quoteForm.quote_amount} onChange={e => setQuoteForm({...quoteForm, quote_amount: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Currency</label><input value={quoteForm.currency} onChange={e => setQuoteForm({...quoteForm, currency: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Scope of Work</label><textarea value={quoteForm.scope_of_work} onChange={e => setQuoteForm({...quoteForm, scope_of_work: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Received Date</label><input type="date" value={quoteForm.received_date} onChange={e => setQuoteForm({...quoteForm, received_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Valid Until</label><input type="date" value={quoteForm.valid_until} onChange={e => setQuoteForm({...quoteForm, valid_until: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="col-span-2 flex items-center gap-2 pt-1">
                        <input type="checkbox" id="pref" checked={quoteForm.is_preferred} onChange={e => setQuoteForm({...quoteForm, is_preferred: e.target.checked})} className="rounded border-border" />
                        <label htmlFor="pref" className="text-sm">Mark as preferred supplier</label>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowQuoteForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateQuote} disabled={saving || !quoteForm.company_name.trim() || !quoteForm.trade.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {subQuotes.length === 0 && !showQuoteForm ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No sub quotes received</div>
              ) : (
                subQuotes.map((q) => (
                  <Card key={q.id}>
                    <CardContent className="flex items-center gap-4 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <DollarSign className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{q.company_name}</p>
                        <p className="text-xs text-muted-foreground">{q.trade} · {q.scope_of_work || "—"}</p>
                      </div>
                      <p className="text-sm font-semibold">{q.currency} {Number(q.quote_amount).toLocaleString()}</p>
                      {q.is_preferred && <span className="text-[10px] bg-emerald-50 text-emerald-600 rounded-full px-1.5 py-0.5 font-medium">Preferred</span>}
                      <button onClick={() => handleDeleteQuote(q.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === q.id}>
                        {deletingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ── RISKS TAB ── */}
          {tab === "risks" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{risks.length} risk{risks.length !== 1 ? "s" : ""}</p>
                <Button size="sm" variant="outline" onClick={() => setShowRiskForm(!showRiskForm)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Risk
                </Button>
              </div>

              {showRiskForm && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="text-xs font-medium">Risk No *</label><input value={riskForm.risk_no} onChange={e => setRiskForm({...riskForm, risk_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Category</label><select value={riskForm.category} onChange={e => setRiskForm({...riskForm, category: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="technical">Technical</option><option value="commercial">Commercial</option><option value="schedule">Schedule</option>
                        <option value="geotechnical">Geotechnical</option><option value="market">Market</option><option value="regulatory">Regulatory</option>
                        <option value="environmental">Environmental</option><option value="other">Other</option>
                      </select></div>
                      <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><textarea value={riskForm.description} onChange={e => setRiskForm({...riskForm, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Likelihood</label><select value={riskForm.likelihood} onChange={e => setRiskForm({...riskForm, likelihood: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="very_low">Very Low</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="very_high">Very High</option>
                      </select></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Impact</label><select value={riskForm.impact} onChange={e => setRiskForm({...riskForm, impact: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                        <option value="very_low">Very Low</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="very_high">Very High</option>
                      </select></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Priced Amount</label><input type="number" value={riskForm.priced_amount} onChange={e => setRiskForm({...riskForm, priced_amount: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="space-y-1"><label className="text-xs font-medium">Owner</label><input value={riskForm.owner} onChange={e => setRiskForm({...riskForm, owner: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                      <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Mitigation</label><textarea value={riskForm.mitigation} onChange={e => setRiskForm({...riskForm, mitigation: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => setShowRiskForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleCreateRisk} disabled={saving || !riskForm.risk_no.trim() || !riskForm.description.trim()}>
                        {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {risks.length === 0 && !showRiskForm ? (
                <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No risk items identified</div>
              ) : (
                risks.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="flex items-center gap-4 p-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                        r.risk_score === "critical" ? "bg-red-50 text-red-600" :
                        r.risk_score === "high" ? "bg-amber-50 text-amber-600" :
                        r.risk_score === "medium" ? "bg-yellow-50 text-yellow-600" : "bg-green-50 text-green-600"
                      )}>{r.risk_score?.toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{r.risk_no} — {r.description}</p>
                        <p className="text-xs text-muted-foreground">{r.category} · {r.likelihood} / {r.impact}</p>
                      </div>
                      <p className="text-sm font-semibold">${Number(r.priced_amount).toLocaleString()}</p>
                      <button onClick={() => handleDeleteRisk(r.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === r.id}>
                        {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      {!selectedTenderId && (
        <div className="rounded-lg border border-border px-6 py-16 text-center text-sm text-muted-foreground">
          <Calculator className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
          <p>Select a tender above to view or create cost estimation data</p>
        </div>
      )}
    </div>
  );
}
