"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type QsExchangeRate,
  deleteExchangeRate,
  getExchangeRates,
  getProjectBaseCurrency,
  setProjectBaseCurrency,
  upsertExchangeRate,
} from "@/lib/qs/qs-service";

const COMMON_CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "INR", name: "Indian Rupee" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "THB", name: "Thai Baht" },
];

const BLANK_RATE = { from_currency: "USD", to_currency: "USD", rate: "", effective_date: new Date().toISOString().split("T")[0], source: "" };

interface Props { projectId: string }

export function CurrencySettings({ projectId }: Props) {
  const [baseCurrency, setBase] = useState("USD");
  const [rates, setRates]       = useState<QsExchangeRate[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState(BLANK_RATE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [base, rateList] = await Promise.all([
        getProjectBaseCurrency(projectId),
        getExchangeRates(projectId),
      ]);
      setBase(base);
      setRates(rateList);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load currency settings"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSaveBase(currency: string) {
    setSaving(true);
    try {
      await setProjectBaseCurrency(projectId, currency);
      setBase(currency);
      toast.success(`Base currency set to ${currency}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to update base currency"); }
    finally { setSaving(false); }
  }

  async function handleAddRate() {
    const rateNum = parseFloat(form.rate);
    if (isNaN(rateNum) || rateNum <= 0) { toast.error("Rate must be a positive number."); return; }
    if (!form.effective_date) { toast.error("Effective date is required."); return; }
    if (form.from_currency === form.to_currency) { toast.error("From and To currencies must differ."); return; }
    setSaving(true);
    try {
      const entry = await upsertExchangeRate({
        project_id: projectId,
        from_currency: form.from_currency,
        to_currency: form.to_currency,
        rate: rateNum,
        effective_date: form.effective_date,
        source: form.source || null,
      });
      setRates((p) => {
        const idx = p.findIndex((r) => r.id === entry.id);
        return idx >= 0 ? p.map((r) => r.id === entry.id ? entry : r) : [entry, ...p];
      });
      setForm(BLANK_RATE);
      setShowAdd(false);
      toast.success("Exchange rate saved");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to save exchange rate"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExchangeRate(id);
      setRates((p) => p.filter((r) => r.id !== id));
      toast.success("Rate removed");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to delete rate"); }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-8">
      {/* Base Currency Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Project Base Currency</h3>
        <p className="mb-4 text-xs text-slate-500">
          All QS reports and budget summaries will display amounts in this currency.
          Cost transactions entered in other currencies will be converted using the exchange rates below.
        </p>
        <div className="flex flex-wrap gap-2">
          {COMMON_CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={saving}
              onClick={() => void handleSaveBase(c.code)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                baseCurrency === c.code
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {c.code}
              <span className="ml-1 font-normal text-slate-400">{c.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Current base currency: <strong className="text-slate-700">{baseCurrency}</strong>
        </p>
      </div>

      {/* Exchange Rates Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Exchange Rates</h3>
            <p className="text-xs text-slate-500">Used to convert foreign currency cost transactions to {baseCurrency}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Rate
            </Button>
          </div>
        </div>

        {/* Add rate form */}
        {showAdd && (
          <div className="border-b border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-medium text-slate-600">New Exchange Rate</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">From</label>
                <select value={form.from_currency}
                  onChange={(e) => setForm((p) => ({ ...p, from_currency: e.target.value }))}
                  className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary">
                  {COMMON_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">To</label>
                <select value={form.to_currency}
                  onChange={(e) => setForm((p) => ({ ...p, to_currency: e.target.value }))}
                  className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary">
                  {COMMON_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">Rate</label>
                <input type="number" min="0.000001" step="any" value={form.rate}
                  onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                  placeholder="1.3500"
                  className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">Effective Date</label>
                <input type="date" value={form.effective_date}
                  onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))}
                  className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">Source</label>
                <input value={form.source}
                  onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
                  placeholder="e.g. Central Bank"
                  className="w-full rounded border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-primary" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void handleAddRate()} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save Rate
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setForm(BLANK_RATE); }}>Cancel</Button>
            </div>
          </div>
        )}

        {rates.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No exchange rates configured. Add rates to enable multi-currency cost entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left">From</th>
                  <th className="px-4 py-2 text-left">To</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-center">Effective Date</th>
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                    <td className="px-4 py-2">
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-mono font-semibold text-blue-700">{r.from_currency}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono font-semibold text-emerald-700">{r.to_currency}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-slate-700">
                      {Number(r.rate).toFixed(6)}
                    </td>
                    <td className="px-4 py-2 text-center text-slate-500">{r.effective_date}</td>
                    <td className="px-4 py-2 text-slate-400">{r.source ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => void handleDelete(r.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Usage Note */}
      <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700">
        <strong>How it works:</strong> When entering cost transactions, select the transaction currency and enter the rate at transaction date.
        The system automatically computes the base-currency equivalent amount for reporting.
        Exchange rates are stored per project so each project can manage its own rate table.
      </div>
    </div>
  );
}
