"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type QsBoqItem,
  type QsCostTransaction,
  type QsExchangeRate,
  createCostTransaction,
  deleteCostTransaction,
  getBoqItems,
  getCostTransactions,
  getExchangeRates,
  getProjectBaseCurrency,
} from "@/lib/qs/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TX_TYPES = ["invoice", "po", "timesheet", "delivery", "other"] as const;
const COST_CATS = ["labor", "material", "equipment", "subcontract", "other"] as const;

const STATUS_CLS: Record<QsCostTransaction["payment_status"], string> = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  paid:     "bg-emerald-100 text-emerald-700",
};

const BLANK = {
  description:      "",
  transaction_type: "invoice" as QsCostTransaction["transaction_type"],
  cost_category:    "material" as QsCostTransaction["cost_category"],
  quantity:         "",
  unit:             "",
  unit_cost:        "",
  total_cost:       "",
  reference_number: "",
  vendor_name:      "",
  cost_date:        new Date().toISOString().split("T")[0],
  boq_item_id:      "",
  notes:            "",
  currency:         "USD",
  exchange_rate:    "1",
};

interface Props { projectId: string }

export function CostEntry({ projectId }: Props) {
  const { can } = useQsPermissions();

  const [transactions, setTransactions] = useState<QsCostTransaction[]>([]);
  const [boqItems, setBoqItems]         = useState<QsBoqItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState(BLANK);
  const [saving, setSaving]             = useState(false);
  const [catFilter, setCatFilter]       = useState("all");
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [exchangeRates, setExchangeRates] = useState<QsExchangeRate[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txs, items, base, rates] = await Promise.all([
        getCostTransactions(projectId),
        getBoqItems(projectId),
        getProjectBaseCurrency(projectId),
        getExchangeRates(projectId),
      ]);
      setTransactions(txs);
      setBoqItems(items);
      setBaseCurrency(base);
      setExchangeRates(rates);
      setForm((prev) => ({ ...prev, currency: base }));
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  function upd(patch: Partial<typeof form>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // Auto-calculate total when qty × rate provided
      if ("quantity" in patch || "unit_cost" in patch) {
        const q = parseFloat(next.quantity);
        const r = parseFloat(next.unit_cost);
        if (!isNaN(q) && !isNaN(r)) next.total_cost = (q * r).toFixed(2);
      }
      return next;
    });
  }

  async function handleSave() {
    const total = parseFloat(form.total_cost);
    if (!form.description.trim() || isNaN(total) || total <= 0) {
      toast.error("Description and total cost are required.");
      return;
    }
    setSaving(true);
    try {
      const tx = await createCostTransaction({
        project_id:       projectId,
        boq_item_id:      form.boq_item_id || null,
        transaction_type: form.transaction_type,
        cost_category:    form.cost_category,
        description:      form.description.trim(),
        quantity:         parseFloat(form.quantity) || null,
        unit:             form.unit || null,
        unit_cost:        parseFloat(form.unit_cost) || null,
        total_cost:       total,
        reference_number: form.reference_number || null,
        vendor_name:      form.vendor_name || null,
        cost_date:        form.cost_date,
        notes:            form.notes || null,
        currency:         form.currency || baseCurrency,
        exchange_rate:    parseFloat(form.exchange_rate) || 1,
      } as Parameters<typeof createCostTransaction>[0]);
      setTransactions((p) => [tx, ...p]);
      setForm((prev) => ({ ...BLANK, currency: prev.currency }));
      setShowForm(false);
      toast.success("Cost recorded");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCostTransaction(id);
      setTransactions((p) => p.filter((t) => t.id !== id));
      toast.success("Transaction deleted");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to delete"); }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const filtered = catFilter === "all"
    ? transactions
    : transactions.filter((t) => t.cost_category === catFilter);
  const totalActual = transactions.reduce((s, t) => s + Number(t.total_cost), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</p>
          <p className="text-lg font-semibold">Total Actual: <span className="text-emerald-600">${fmt(totalActual)}</span></p>
        </div>
        {can("costs", "can_create") && (
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Record Cost
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">New Cost Transaction</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Type</label>
              <select
                value={form.transaction_type}
                onChange={(e) => upd({ transaction_type: e.target.value as any })}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm capitalize outline-none focus:border-primary"
              >
                {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Category</label>
              <select
                value={form.cost_category}
                onChange={(e) => upd({ cost_category: e.target.value as any })}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm capitalize outline-none focus:border-primary"
              >
                {COST_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Date *</label>
              <input
                type="date"
                value={form.cost_date}
                onChange={(e) => upd({ cost_date: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">BOQ Item</label>
              <select
                value={form.boq_item_id}
                onChange={(e) => upd({ boq_item_id: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">— Unlinked —</option>
                {boqItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.description}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Description *</label>
              <input
                value={form.description}
                onChange={(e) => upd({ description: e.target.value })}
                placeholder="What was purchased or paid for?"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Vendor / Supplier</label>
              <input
                value={form.vendor_name}
                onChange={(e) => upd({ vendor_name: e.target.value })}
                placeholder="Vendor name"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Qty</label>
              <input type="number" min="0" step="any" value={form.quantity} onChange={(e) => upd({ quantity: e.target.value })}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Unit</label>
              <input value={form.unit} onChange={(e) => upd({ unit: e.target.value })}
                placeholder="m3, EA, hr…"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Unit Cost</label>
              <input type="number" min="0" step="any" value={form.unit_cost} onChange={(e) => upd({ unit_cost: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Total Cost *</label>
              <input type="number" min="0" step="any" value={form.total_cost} onChange={(e) => upd({ total_cost: e.target.value })}
                placeholder="0.00"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-emerald-700 outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Reference No.</label>
              <input value={form.reference_number} onChange={(e) => upd({ reference_number: e.target.value })}
                placeholder="Invoice / PO number"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Notes</label>
              <input value={form.notes} onChange={(e) => upd({ notes: e.target.value })}
                placeholder="Optional notes"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Currency row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">Currency</label>
              <select value={form.currency}
                onChange={(e) => {
                  const code = e.target.value;
                  const rate = exchangeRates.find((r) => r.from_currency === code && r.to_currency === baseCurrency);
                  upd({ currency: code, exchange_rate: rate ? String(rate.rate) : (code === baseCurrency ? "1" : "") });
                }}
                className="w-full rounded-lg border border-border bg-white px-2 py-2 text-sm outline-none focus:border-primary">
                {["USD","EUR","GBP","AUD","CAD","SGD","MYR","CNY","JPY","AED","SAR","QAR","INR","IDR","THB"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">
                Rate → {baseCurrency}
              </label>
              <input type="number" min="0.000001" step="any" value={form.exchange_rate}
                onChange={(e) => upd({ exchange_rate: e.target.value })}
                placeholder="1.0000"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            {form.currency !== baseCurrency && form.total_cost && form.exchange_rate && (
              <div className="col-span-2 flex items-end pb-2">
                <p className="text-xs text-slate-500">
                  = <strong className="text-emerald-700">
                    {(parseFloat(form.total_cost) * parseFloat(form.exchange_rate)).toLocaleString("en-US", { minimumFractionDigits: 2 })} {baseCurrency}
                  </strong> at this rate
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saving || !form.description.trim() || !form.total_cost}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save Transaction
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setForm(BLANK); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        {["all", ...COST_CATS].map((cat) => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              catFilter === cat
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Transactions table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <Receipt className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No cost transactions yet. Record your first cost above.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Vendor</th>
                <th className="px-3 py-2 text-center">Type</th>
                <th className="px-3 py-2 text-center">Category</th>
                <th className="px-3 py-2 text-left">BOQ Item</th>
                <th className="px-3 py-2 text-left">Ref#</th>
                <th className="px-3 py-2 text-center">Ccy</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="w-8 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-500">{tx.cost_date}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-slate-700">{tx.description}</td>
                  <td className="px-3 py-2 text-slate-500">{tx.vendor_name ?? "—"}</td>
                  <td className="px-3 py-2 text-center capitalize text-slate-500">{tx.transaction_type}</td>
                  <td className="px-3 py-2 text-center capitalize text-slate-500">{tx.cost_category}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-slate-400">
                    {(tx.qs_boq_items as any)?.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-400">{tx.reference_number ?? "—"}</td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-slate-400">
                    {(tx as unknown as Record<string, unknown>).currency as string ?? baseCurrency}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-700">${fmt(Number(tx.total_cost))}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_CLS[tx.payment_status])}>
                      {tx.payment_status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {can("costs", "delete") && (
                      <button
                        onClick={() => void handleDelete(tx.id)}
                        className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
