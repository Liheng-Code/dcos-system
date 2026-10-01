"use client";

import { useEffect, useState } from "react";
import { createExchangeRate, listCurrencies, listExchangeRates } from "@/lib/account/account-service";
import { Loader2, Plus, DollarSign, TrendingUp, CornerDownRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRateForm, setShowRateForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rateForm, setRateForm] = useState({
    from_currency: "USD", to_currency: "KHR", rate: "", effective_date: new Date().toISOString().split("T")[0], source: "manual",
  });

  useEffect(() => {
    Promise.all([
      listCurrencies(),
      listExchangeRates(),
    ]).then(([c, r]) => {
      if (c.data) setCurrencies(c.data);
      if (r.data) setRates(r.data);
      setLoading(false);
    });
  }, []);

  async function handleAddRate() {
    setSaving(true);
    const { error } = await createExchangeRate({
      from_currency: rateForm.from_currency,
      to_currency: rateForm.to_currency,
      rate: parseFloat(rateForm.rate),
      effective_date: rateForm.effective_date,
      source: rateForm.source,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Exchange rate added");
    setShowRateForm(false);
    setRateForm({ ...rateForm, rate: "" });
    listExchangeRates().then(({ data }) => {
      if (data) setRates(data);
    });
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Multi-Currency</h1>
          <p className="text-sm text-muted-foreground">Currencies, exchange rates, and FX tracking</p>
        </div>
        <Button onClick={() => setShowRateForm(!showRateForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Add Exchange Rate
        </Button>
      </div>

      {/* Currencies */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Supported Currencies</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {currencies.map((c) => (
            <Card key={c.id}>
              <CardContent className={cn("p-3 flex items-center gap-2", c.is_base && "ring-1 ring-primary")}>
                <span className="text-lg font-bold">{c.symbol}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.code}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.name}</p>
                </div>
                {c.is_base && <span className="ml-auto text-[9px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">Base</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Add Rate Form */}
      {showRateForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">From</label>
                <select value={rateForm.from_currency} onChange={(e) => setRateForm({ ...rateForm, from_currency: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {currencies.map((c) => (<option key={c.code} value={c.code}>{c.code}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">To</label>
                <select value={rateForm.to_currency} onChange={(e) => setRateForm({ ...rateForm, to_currency: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  {currencies.map((c) => (<option key={c.code} value={c.code}>{c.code}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Rate *</label>
                <input type="number" step="0.000001" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Effective Date</label>
                <input type="date" value={rateForm.effective_date} onChange={(e) => setRateForm({ ...rateForm, effective_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Source</label>
                <select value={rateForm.source} onChange={(e) => setRateForm({ ...rateForm, source: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="manual">Manual</option>
                  <option value="api">API</option>
                  <option value="bank">Bank</option>
                  <option value="central_bank">Central Bank</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowRateForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddRate} disabled={saving || !rateForm.rate}>Add Rate</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exchange Rates */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Exchange Rates</h2>
        {rates.length === 0 ? (
          <div className="rounded-lg border border-border px-6 py-8 text-center text-sm text-muted-foreground">
            No exchange rates recorded
          </div>
        ) : (
          <div className="space-y-1">
            {rates.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{r.from_currency}</span>
                <CornerDownRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-semibold">{r.to_currency}</span>
                <span className="font-mono">{Number(r.rate).toFixed(6)}</span>
                <span className="text-xs text-muted-foreground ml-auto">{r.effective_date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
