"use client";

import { useEffect, useState, useCallback } from "react";
import { deleteTenderSubQuoteById, insertTenderSubQuote, listTenderSubQuotesByTenderId } from "@/lib/qs/qs-queries";
import { Loader2, Plus, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubQuote = any;

export function SubQuotesTab({ tenderId }: { tenderId: string }) {
  const [subQuotes, setSubQuotes] = useState<SubQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ company_name: "", trade: "", quote_amount: "0", currency: "USD", scope_of_work: "", received_date: new Date().toISOString().split("T")[0], valid_until: "", is_preferred: false });

  const { can } = useTenderPermissions();


  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listTenderSubQuotesByTenderId(tenderId);
    if (data) setSubQuotes(data);
    setLoading(false);
  }, [tenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleCreateQuote() {
    setSaving(true);
    const { error } = await insertTenderSubQuote({
      tender_id: tenderId, company_name: quoteForm.company_name, trade: quoteForm.trade,
      quote_amount: parseFloat(quoteForm.quote_amount) || 0, currency: quoteForm.currency,
      scope_of_work: quoteForm.scope_of_work || null,
      received_date: quoteForm.received_date, valid_until: quoteForm.valid_until || null,
      is_preferred: quoteForm.is_preferred,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Sub quote added");
    setShowQuoteForm(false);
    setQuoteForm({ company_name: "", trade: "", quote_amount: "0", currency: "USD", scope_of_work: "", received_date: new Date().toISOString().split("T")[0], valid_until: "", is_preferred: false });
    await load();
    setSaving(false);
  }

  async function handleDeleteQuote(id: string) {
    setDeletingId(id);
    const { error } = await deleteTenderSubQuoteById(id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Quote deleted");
    setSubQuotes(subQuotes.filter((q: SubQuote) => q.id !== id));
    setDeletingId(null);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{subQuotes.length} quote{subQuotes.length !== 1 ? "s" : ""}</p>
        {can("tender_sub_quotes", "can_create") && (
        <Button size="sm" variant="outline" onClick={() => setShowQuoteForm(!showQuoteForm)}>
          <Plus className="mr-1 h-4 w-4" /> Add Quote
        </Button>
        )}
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
        subQuotes.map((q: SubQuote) => (
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
              {can("tender_sub_quotes", "delete") && (
              <button onClick={() => handleDeleteQuote(q.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === q.id}>
                {deletingId === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
