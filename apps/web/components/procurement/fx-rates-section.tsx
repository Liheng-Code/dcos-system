"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getFxSettings,
  getProfileById,
  insertFxRate,
  listFxRates,
  updateFxBaseCurrency,
  type FxRate,
} from "@/lib/procurement/procurement-queries";
import { bangkokToday } from "@/lib/procurement/sealed-bids";
import { procErrorMessage } from "@/lib/procurement/procurement-transitions";

type Loaded = [Awaited<ReturnType<typeof getFxSettings>>, Awaited<ReturnType<typeof listFxRates>>];

/** Base currency and exchange rates used to put PO amounts into approval bands. */
export function FxRatesSection({ canConfigure }: { canConfigure: boolean }) {
  const [base, setBase] = useState<string | null>(null);
  const [baseDraft, setBaseDraft] = useState("");
  const [rates, setRates] = useState<FxRate[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingBase, setSavingBase] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ currency: "", rate: "", effective_date: bangkokToday() });

  const apply = useCallback(async ([s, r]: Loaded) => {
    const err = s.error ?? r.error;
    if (err) {
      setError(procErrorMessage(err));
      setLoading(false);
      return;
    }
    setError(null);
    setBase(s.data?.base_currency ?? null);
    setBaseDraft(s.data?.base_currency ?? "");
    const list = r.data ?? [];
    setRates(list);
    setLoading(false);
    const ids = [...new Set(list.map(x => x.created_by).filter((v): v is string => !!v))];
    const entries = await Promise.all(ids.map(async id => {
      const { data } = await getProfileById(id);
      return [id, (data as { full_name?: string } | null)?.full_name ?? "User"] as const;
    }));
    setNames(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getFxSettings(), listFxRates()]).then(r => { if (active) void apply(r); });
    return () => { active = false; };
  }, [apply]);

  function reload() {
    setLoading(true);
    void Promise.all([getFxSettings(), listFxRates()]).then(apply);
  }

  async function saveBase() {
    const code = baseDraft.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) { toast.error("Enter a 3-letter currency code."); return; }
    setSavingBase(true);
    const { error: err } = await updateFxBaseCurrency(code);
    setSavingBase(false);
    if (err) { toast.error(procErrorMessage(err)); return; }
    toast.success("Base currency updated");
    reload();
  }

  async function addRate(e: React.FormEvent) {
    e.preventDefault();
    const currency = form.currency.trim().toUpperCase();
    const rate = Number(form.rate);
    if (!/^[A-Z]{3}$/.test(currency)) { toast.error("Enter a 3-letter currency code."); return; }
    if (!Number.isFinite(rate) || rate <= 0) { toast.error("Rate must be greater than 0."); return; }
    if (!form.effective_date) { toast.error("Enter an effective date."); return; }
    setAdding(true);
    const { error: err } = await insertFxRate({ currency, rate_to_base: rate, effective_date: form.effective_date });
    setAdding(false);
    if (err) { toast.error(procErrorMessage(err)); return; }
    toast.success("Rate added");
    setForm({ currency: "", rate: "", effective_date: bangkokToday() });
    reload();
  }

  // Per currency, the newest rate whose effective date is not in the future is the one in force.
  const today = bangkokToday();
  const inForce = new Set<string>();
  const seen = new Set<string>();
  for (const r of rates) {
    if (r.effective_date <= today && !seen.has(r.currency)) {
      seen.add(r.currency);
      inForce.add(r.id);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <h3 className="font-semibold text-sm">Exchange rates for approval bands</h3>
        <p className="text-sm text-muted-foreground">
          PO amounts are converted to the base currency to pick the approval band. For each currency, the newest rate
          with an effective date of today or earlier applies. Rates are append-only: to correct one, add a new rate.
        </p>
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 dark:border-amber-500/30">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Changes to the base currency and exchange rates are recorded in the audit log as critical.</span>
        </div>

        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-red-600">{error}</p>
            <Button size="sm" variant="outline" onClick={reload}><RefreshCw className="h-4 w-4 mr-1" /> Retry</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fx-base">Base currency</Label>
                <Input
                  id="fx-base"
                  className="h-8 w-28 uppercase"
                  maxLength={3}
                  value={baseDraft}
                  disabled={!canConfigure || savingBase}
                  onChange={e => setBaseDraft(e.target.value)}
                />
              </div>
              {canConfigure && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void saveBase()}
                  disabled={savingBase || baseDraft.trim().toUpperCase() === (base ?? "")}
                >
                  {savingBase && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Change base currency
                </Button>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Currency</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Rate to {base ?? "base"}</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Effective date</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Added by</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Added at</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        No exchange rates yet. POs in a non-base currency cannot be approved until a rate is added.
                      </td>
                    </tr>
                  ) : rates.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">
                        {r.currency}
                        {inForce.has(r.id) && <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-600">In force</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.rate_to_base.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td className="px-3 py-2">{r.effective_date}</td>
                      <td className="px-3 py-2">{r.created_by ? (names[r.created_by] ?? "...") : "-"}</td>
                      <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canConfigure && (
              <form onSubmit={addRate} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fx-cur">Currency</Label>
                  <Input id="fx-cur" className="h-8 w-24 uppercase" maxLength={3} placeholder="EUR" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fx-rate">Rate to {base ?? "base"}</Label>
                  <Input id="fx-rate" className="h-8 w-36 text-right" type="number" min="0" step="any" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fx-date">Effective date</Label>
                  <Input id="fx-date" className="h-8 w-40" type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
                </div>
                <Button type="submit" size="sm" disabled={adding} className="gap-2">
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add rate
                </Button>
              </form>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
