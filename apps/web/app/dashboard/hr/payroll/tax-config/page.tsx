"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Bracket {
  id?: string;
  from_khr: number;
  to_khr: number | null;
  rate_percent: number;
  tolerance_khr: number;
  effective_date: string;
  status: string;
  isDirty?: boolean;
  isNew?: boolean;
}

interface Relief {
  id?: string;
  relief_type: "spouse" | "child";
  amount_khr: number;
  effective_date: string;
  status: string;
}

interface FlatRate {
  id?: string;
  rate_type: string;
  rate_percent: number;
  effective_date: string;
  status: string;
}

interface ExchangeRate {
  id?: string;
  period_year: number;
  period_month: number;
  rate_khr_per_usd: number;
  source: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtKHR(n: number) {
  return n.toLocaleString("km-KH");
}
function monthLabel(y: number, m: number) {
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const STATUS_COLORS: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  archived: "border-slate-200 bg-slate-100 text-slate-500",
};

const TAB_TRIGGER_CLS =
  "rounded-none border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[active]:border-primary data-[active]:bg-transparent data-[active]:text-primary data-[active]:shadow-none";

// ─── Bracket overlap validation ───────────────────────────────────────────────

function hasBracketOverlap(brackets: Bracket[]): boolean {
  const sorted = [...brackets].sort((a, b) => a.from_khr - b.from_khr);
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const curTop = cur.to_khr ?? Infinity;
    if (next.from_khr <= curTop) return true;
  }
  return false;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TaxConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [brackets, setBrackets] = useState<Bracket[]>([]);
  const [relief, setRelief] = useState<Relief[]>([]);
  const [flatRates, setFlatRates] = useState<FlatRate[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [currentRate, setCurrentRate] = useState<ExchangeRate>({
    period_year: new Date().getFullYear(),
    period_month: new Date().getMonth() + 1,
    rate_khr_per_usd: 4000,
    source: "manual",
  });

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("tos_brackets").select("*").order("effective_date", { ascending: false }).order("from_khr"),
      supabase.from("tos_dependent_relief").select("*").order("effective_date", { ascending: false }),
      supabase.from("tos_flat_rates").select("*").order("effective_date", { ascending: false }),
      supabase.from("tos_exchange_rates").select("*").order("period_year", { ascending: false }).order("period_month", { ascending: false }),
    ]).then(([bRes, rRes, frRes, erRes]) => {
      setBrackets((bRes.data ?? []) as Bracket[]);
      setRelief((rRes.data ?? []) as Relief[]);
      setFlatRates((frRes.data ?? []) as FlatRate[]);
      const rates = (erRes.data ?? []) as ExchangeRate[];
      setExchangeRates(rates);
      if (rates.length > 0) {
        const latest = rates[0];
        setCurrentRate({ period_year: latest.period_year, period_month: latest.period_month, rate_khr_per_usd: latest.rate_khr_per_usd, source: latest.source, id: latest.id });
      }
      setLoading(false);
    });
  }, []);

  // ── Bracket actions ────────────────────────────────────────────────────────

  function addBracket() {
    const lastBracket = brackets.filter((b) => b.status === "active").sort((a, b) => b.from_khr - a.from_khr)[0];
    setBrackets((prev) => [...prev, {
      from_khr: lastBracket?.to_khr ? lastBracket.to_khr + 1 : 0,
      to_khr: null,
      rate_percent: 0,
      tolerance_khr: 0,
      effective_date: new Date().toISOString().slice(0, 10),
      status: "draft",
      isDirty: true,
      isNew: true,
    }]);
  }

  function updateBracket(idx: number, field: keyof Bracket, value: unknown) {
    setBrackets((prev) => prev.map((b, i) => i === idx ? { ...b, [field]: value, isDirty: true } : b));
  }

  function removeBracket(idx: number) {
    setBrackets((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveBrackets() {
    const dirty = brackets.filter((b) => b.isDirty);
    if (dirty.length === 0) { toast.info("No changes to save"); return; }

    const activeBrackets = brackets.filter((b) => b.status === "active");
    if (hasBracketOverlap(activeBrackets)) {
      toast.error("Active brackets overlap — fix ranges before saving");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    let hasError = false;

    for (const b of dirty) {
      const payload = { from_khr: b.from_khr, to_khr: b.to_khr, rate_percent: b.rate_percent, tolerance_khr: b.tolerance_khr ?? 0, effective_date: b.effective_date, status: b.status };
      if (b.id) {
        const { error } = await supabase.from("tos_brackets").update(payload).eq("id", b.id);
        if (error) { toast.error(error.message); hasError = true; }
      } else {
        const { error, data } = await supabase.from("tos_brackets").insert(payload).select("id").single();
        if (error) { toast.error(error.message); hasError = true; }
        else if (data) {
          setBrackets((prev) => prev.map((x) => x === b ? { ...x, id: data.id, isNew: false, isDirty: false } : x));
        }
      }
    }

    if (!hasError) {
      toast.success("Tax brackets saved");
      setBrackets((prev) => prev.map((b) => ({ ...b, isDirty: false })));
    }
    setSaving(false);
  }

  // ── Relief actions ─────────────────────────────────────────────────────────

  async function saveRelief() {
    setSaving(true);
    const supabase = createClient();
    for (const r of relief) {
      const payload = { relief_type: r.relief_type, amount_khr: r.amount_khr, effective_date: r.effective_date, status: r.status };
      if (r.id) {
        const { error } = await supabase.from("tos_dependent_relief").update(payload).eq("id", r.id);
        if (error) { toast.error(error.message); setSaving(false); return; }
      } else {
        const { error, data } = await supabase.from("tos_dependent_relief").insert(payload).select("id").single();
        if (error) { toast.error(error.message); setSaving(false); return; }
        if (data) setRelief((prev) => prev.map((x) => x === r ? { ...x, id: data.id } : x));
      }
    }
    toast.success("Dependent relief saved");
    setSaving(false);
  }

  // ── Flat rate actions ──────────────────────────────────────────────────────

  async function saveFlatRates() {
    setSaving(true);
    const supabase = createClient();
    for (const fr of flatRates) {
      const payload = { rate_type: fr.rate_type, rate_percent: fr.rate_percent, effective_date: fr.effective_date, status: fr.status };
      if (fr.id) {
        const { error } = await supabase.from("tos_flat_rates").update(payload).eq("id", fr.id);
        if (error) { toast.error(error.message); setSaving(false); return; }
      }
    }
    toast.success("Flat rates saved");
    setSaving(false);
  }

  // ── Exchange rate actions ──────────────────────────────────────────────────

  async function saveExchangeRate() {
    setSaving(true);
    const supabase = createClient();
    const payload = { period_year: currentRate.period_year, period_month: currentRate.period_month, rate_khr_per_usd: currentRate.rate_khr_per_usd, source: currentRate.source };
    if (currentRate.id) {
      const { error } = await supabase.from("tos_exchange_rates").update(payload).eq("id", currentRate.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { error, data } = await supabase.from("tos_exchange_rates").upsert(payload, { onConflict: "period_year,period_month" }).select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      if (data) { setCurrentRate((p) => ({ ...p, id: data.id })); setExchangeRates((prev) => [{ ...currentRate, id: data.id }, ...prev.filter((r) => !(r.period_year === currentRate.period_year && r.period_month === currentRate.period_month))]); }
    }
    toast.success(`Exchange rate for ${monthLabel(currentRate.period_year, currentRate.period_month)} saved`);
    setSaving(false);
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeBrackets = brackets.filter((b) => b.status === "active");
  const overlapping = hasBracketOverlap(activeBrackets);

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h2 className="text-2xl font-bold tracking-tight">Tax Configuration — Cambodia TOS</h2>
        <p className="text-muted-foreground text-sm">Manage Tax on Salary brackets, dependent relief, and exchange rates</p>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />

        <Tabs defaultValue="brackets" className="gap-0">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none border-b border-border bg-transparent px-4 pt-3 pb-0 text-muted-foreground">
            <TabsTrigger value="brackets" className={TAB_TRIGGER_CLS}>Tax Brackets</TabsTrigger>
            <TabsTrigger value="relief" className={TAB_TRIGGER_CLS}>Dependent Relief</TabsTrigger>
            <TabsTrigger value="flat" className={TAB_TRIGGER_CLS}>Non-Resident / FBT</TabsTrigger>
            <TabsTrigger value="exchange" className={TAB_TRIGGER_CLS}>Exchange Rate</TabsTrigger>
            <TabsTrigger value="history" className={TAB_TRIGGER_CLS}>Rate History</TabsTrigger>
          </TabsList>

          <div className="p-4">
          {/* ── Tax Brackets ─────────────────────────────────────────────── */}
          <TabsContent value="brackets" className="mt-0 space-y-4">
          {overlapping && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Active brackets have overlapping ranges. Fix before saving.
            </div>
          )}

          <div>
            <div className="flex flex-row items-center justify-between pb-3">
              <h3 className="text-sm font-semibold">Cambodia TOS Brackets (KHR / Month)</h3>
              <Button size="sm" variant="outline" onClick={addBracket} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Bracket
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-right font-medium">From (KHR)</th>
                    <th className="px-4 py-2.5 text-right font-medium">To (KHR)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Rate %</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tolerance (KHR)</th>
                    <th className="px-4 py-2.5 text-left font-medium">Effective Date</th>
                    <th className="px-4 py-2.5 text-center font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {brackets.map((b, idx) => (
                    <tr key={b.id ?? idx} className={cn(
                      "border-l-[3px] transition-colors duration-100",
                      b.isDirty
                        ? "border-l-blue-400 bg-blue-50/50 hover:bg-blue-100/70"
                        : "border-l-transparent hover:bg-sky-50 hover:border-l-sky-400",
                    )}>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          value={b.from_khr}
                          onChange={(e) => updateBracket(idx, "from_khr", Number(e.target.value))}
                          className="h-8 w-36 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          value={b.to_khr ?? ""}
                          placeholder="Unlimited"
                          onChange={(e) => updateBracket(idx, "to_khr", e.target.value ? Number(e.target.value) : null)}
                          className="h-8 w-36 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          value={b.rate_percent}
                          onChange={(e) => updateBracket(idx, "rate_percent", Number(e.target.value))}
                          className="h-8 w-20 text-right"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          min={0}
                          step="100"
                          value={b.tolerance_khr ?? 0}
                          placeholder="0"
                          onChange={(e) => updateBracket(idx, "tolerance_khr", Number(e.target.value))}
                          className="h-8 w-36 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Input
                          type="date"
                          value={b.effective_date}
                          onChange={(e) => updateBracket(idx, "effective_date", e.target.value)}
                          className="h-8 w-36"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <select
                          value={b.status}
                          onChange={(e) => updateBracket(idx, "status", e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => removeBracket(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {brackets.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">No brackets defined. Add the first bracket.</p>
              )}
              </div>
            </div>
          </div>

          {/* Preview of active brackets */}
          {activeBrackets.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active Brackets Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                {activeBrackets.sort((a, b) => a.from_khr - b.from_khr).map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 rounded-md px-2 py-1 transition-colors duration-100 hover:bg-emerald-100/70 cursor-default">
                    <span className="text-muted-foreground">
                      {fmtKHR(b.from_khr)} – {b.to_khr ? fmtKHR(b.to_khr) : "Unlimited"} KHR
                    </span>
                    <div className="flex items-center gap-3 tabular-nums">
                      {(b.tolerance_khr ?? 0) > 0 && (
                        <span className="text-amber-600 text-[10px]">
                          ±{fmtKHR(b.tolerance_khr)} KHR tolerance
                        </span>
                      )}
                      <span className="font-semibold">{b.rate_percent}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={saveBrackets} disabled={saving || overlapping} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Brackets
            </Button>
          </div>
        </TabsContent>

        {/* ── Dependent Relief ─────────────────────────────────────────── */}
        <TabsContent value="relief" className="mt-0 space-y-4">
          <h3 className="text-sm font-semibold">Dependent Relief Amounts</h3>
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Relief is deducted from taxable income (KHR) before applying TOS brackets. Spouse relief requires marital_status = married on employee tax profile.
          </div>
          {relief.map((r, idx) => (
            <div key={r.id ?? idx} className="grid gap-4 md:grid-cols-4 items-end rounded-lg border border-border p-4 transition-all duration-150 hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-sm cursor-default">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Relief Type</Label>
                <div className="font-medium capitalize">{r.relief_type} Dependent</div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Amount (KHR / Month)</Label>
                <Input
                  type="number"
                  value={r.amount_khr}
                  onChange={(e) => setRelief((prev) => prev.map((x, i) => i === idx ? { ...x, amount_khr: Number(e.target.value) } : x))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Effective Date</Label>
                <Input
                  type="date"
                  value={r.effective_date}
                  onChange={(e) => setRelief((prev) => prev.map((x, i) => i === idx ? { ...x, effective_date: e.target.value } : x))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Badge variant="outline" className={cn("capitalize", STATUS_COLORS[r.status] ?? "")}>
                  {r.status}
                </Badge>
              </div>
            </div>
          ))}
          {relief.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No relief rules configured.</p>
          )}
          <div className="flex justify-end">
            <Button onClick={saveRelief} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Relief
            </Button>
          </div>
        </TabsContent>

        {/* ── Non-Resident / FBT ───────────────────────────────────────── */}
        <TabsContent value="flat" className="mt-0 space-y-4">
          <h3 className="text-sm font-semibold">Flat Tax Rates</h3>
          {flatRates.map((fr, idx) => (
            <div key={fr.id ?? idx} className="grid gap-4 md:grid-cols-4 items-end rounded-lg border border-border p-4 transition-all duration-150 hover:border-violet-300 hover:bg-violet-50/40 hover:shadow-sm cursor-default">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rate Type</Label>
                <div className="font-medium capitalize">{fr.rate_type === "non_resident" ? "Non-Resident Salary Tax" : "Fringe Benefit Tax"}</div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rate %</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={fr.rate_percent}
                  onChange={(e) => setFlatRates((prev) => prev.map((x, i) => i === idx ? { ...x, rate_percent: Number(e.target.value) } : x))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Effective Date</Label>
                <Input
                  type="date"
                  value={fr.effective_date}
                  onChange={(e) => setFlatRates((prev) => prev.map((x, i) => i === idx ? { ...x, effective_date: e.target.value } : x))}
                />
              </div>
              <Badge variant="outline" className={cn("capitalize self-end mb-1.5", STATUS_COLORS[fr.status] ?? "")}>
                {fr.status}
              </Badge>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={saveFlatRates} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </TabsContent>

        {/* ── Exchange Rate ─────────────────────────────────────────────── */}
        <TabsContent value="exchange" className="mt-0 space-y-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Monthly USD → KHR Exchange Rate</h3>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              TOS is calculated in KHR. Salaries paid in USD are converted using the exchange rate set for each payroll period.
            </div>
            <div className="grid gap-4 md:grid-cols-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Year</Label>
                <Input
                  type="number"
                  value={currentRate.period_year}
                  onChange={(e) => setCurrentRate((p) => ({ ...p, period_year: Number(e.target.value), id: undefined }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Month</Label>
                <select
                  value={currentRate.period_month}
                  onChange={(e) => setCurrentRate((p) => ({ ...p, period_month: Number(e.target.value), id: undefined }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Rate (KHR per 1 USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={currentRate.rate_khr_per_usd}
                  onChange={(e) => setCurrentRate((p) => ({ ...p, rate_khr_per_usd: Number(e.target.value) }))}
                />
              </div>
              <Button onClick={saveExchangeRate} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Rate
              </Button>
            </div>
          </div>

          {/* Previous rates */}
          {exchangeRates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Recent Exchange Rates</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Period</th>
                      <th className="px-4 py-2 text-right font-medium">Rate (KHR/USD)</th>
                      <th className="px-4 py-2 text-left font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {exchangeRates.slice(0, 12).map((r) => (
                      <tr key={r.id ?? `${r.period_year}-${r.period_month}`} className="border-l-[3px] border-l-transparent transition-colors duration-100 hover:bg-amber-50 hover:border-l-amber-400">
                        <td className="px-4 py-2 font-medium">{monthLabel(r.period_year, r.period_month)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.rate_khr_per_usd.toLocaleString()}</td>
                        <td className="px-4 py-2 text-muted-foreground capitalize">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Rate History ─────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-0">
          <h3 className="text-sm font-semibold pb-3">Tax Rule History</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-right font-medium">From (KHR)</th>
                  <th className="px-4 py-2.5 text-right font-medium">To (KHR)</th>
                  <th className="px-4 py-2.5 text-right font-medium">Rate %</th>
                  <th className="px-4 py-2.5 text-right font-medium">Tolerance (KHR)</th>
                  <th className="px-4 py-2.5 text-left font-medium">Effective Date</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {brackets.sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()).map((b, i) => (
                  <tr key={b.id ?? i} className={cn(
                    "border-l-[3px] border-l-transparent transition-colors duration-100",
                    b.status === "active" && "hover:bg-emerald-50 hover:border-l-emerald-400",
                    b.status === "draft" && "hover:bg-slate-50 hover:border-l-slate-400",
                    b.status === "archived" && "hover:bg-slate-50/60 hover:border-l-slate-300 opacity-60",
                  )}>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtKHR(b.from_khr)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.to_khr ? fmtKHR(b.to_khr) : "Unlimited"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{b.rate_percent}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {(b.tolerance_khr ?? 0) > 0 ? fmtKHR(b.tolerance_khr) : "—"}
                    </td>
                    <td className="px-4 py-2.5">{b.effective_date}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className={cn("capitalize text-[10px]", STATUS_COLORS[b.status] ?? "")}>
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {brackets.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No bracket history yet.</p>
            )}
            </div>
          </div>
        </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
