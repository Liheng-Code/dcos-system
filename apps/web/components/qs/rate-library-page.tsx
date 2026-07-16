"use client";

import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Plus, Trash2, Search, ChevronDown, ChevronRight, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getLibraryRates, getLibraryRate, createLibraryRate, updateLibraryRate, deleteLibraryRate,
  getLibraryRateUsageCount,
  type CompanyLibraryRate, type CompanyLibraryRateWithLines, type CompanyLibraryRateLine,
} from "@/lib/company-rate-library";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MODE_BADGES: Record<string, { label: string; cls: string }> = {
  flat:     { label: "Flat",     cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  buildup:  { label: "Build-up", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

const UNITS = ["ea", "m", "m²", "m³", "kg", "ton", "hr", "day", "ls"];

const DISCIPLINES = ["Structural", "Architecture", "MEP"];

type LineDraft = {
  _key: string;
  category: "material" | "labor" | "plant" | "subcon";
  price_list_item_code: string;
  price_list_item_desc: string;
  unit_price: string;
  qty_per_unit: string;
  wastage_pct: string;
};

type RateForm = {
  code: string;
  description: string;
  trade: string;
  discipline: string;
  unit: string;
  mode: "flat" | "buildup";
  base_rate: string;
  wastage_pct: string;
  productivity_factor: string;
  notes: string;
  lines: LineDraft[];
};

const EMPTY_FORM: RateForm = {
  code: "", description: "", trade: "", discipline: "", unit: "ea", mode: "flat",
  base_rate: "0", wastage_pct: "0", productivity_factor: "1", notes: "", lines: [],
};

let _keySeq = 0;
function newKey(): string { return `lib_line_${++_keySeq}_${Date.now()}`; }

function computeLineTotal(line: LineDraft): number {
  const price = parseFloat(line.unit_price) || 0;
  const qty = parseFloat(line.qty_per_unit) || 0;
  const waste = parseFloat(line.wastage_pct) || 0;
  if (line.category === "material") return qty * price * (1 + waste / 100);
  return qty * price;
}

function computeBuildupNet(lines: LineDraft[], prodFactor: number): number {
  let materialSub = 0;
  let laborPlantSub = 0;
  for (const line of lines) {
    const total = computeLineTotal(line);
    if (line.category === "material") materialSub += total;
    else laborPlantSub += total;
  }
  const pf = prodFactor > 0 ? prodFactor : 1;
  return materialSub + laborPlantSub / pf;
}

function computeFlatNet(baseRate: number, wastagePct: number, prodFactor: number): number {
  const pf = prodFactor > 0 ? prodFactor : 1;
  return baseRate * (1 + wastagePct / 100) / pf;
}

export function RateLibraryPage() {
  const [rates, setRates] = useState<CompanyLibraryRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RateForm>(EMPTY_FORM);

  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [expandedRate, setExpandedRate] = useState<string | null>(null);
  const [rateDetails, setRateDetails] = useState<Record<string, CompanyLibraryRateWithLines>>({});
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLibraryRates({ search: search || undefined, trade: tradeFilter || undefined, discipline: disciplineFilter || undefined });
      setRates(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, [search, tradeFilter, disciplineFilter]);

  useEffect(() => { load(); }, [load]);

  const trades = useMemo(() => {
    const set = new Set<string>();
    rates.forEach((r) => { if (r.trade) set.add(r.trade); });
    return Array.from(set).sort();
  }, [rates]);

  // Live computed values
  const liveLineTotals = useMemo(() => form.lines.map((l) => computeLineTotal(l)), [form.lines]);
  const liveMaterialSub = useMemo(() => liveLineTotals.reduce((sum, t, i) => sum + (form.lines[i]?.category === "material" ? t : 0), 0), [liveLineTotals, form.lines]);
  const liveLaborPlantSub = useMemo(() => liveLineTotals.reduce((sum, t, i) => {
    const cat = form.lines[i]?.category;
    return sum + (cat === "labor" || cat === "plant" || cat === "subcon" ? t : 0);
  }, 0), [liveLineTotals, form.lines]);
  const liveProdFactor = parseFloat(form.productivity_factor) || 1;
  const liveNetRate = form.mode === "buildup"
    ? computeBuildupNet(form.lines, liveProdFactor)
    : computeFlatNet(parseFloat(form.base_rate) || 0, parseFloat(form.wastage_pct) || 0, liveProdFactor);

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, lines: [{ _key: newKey(), category: "material", price_list_item_code: "", price_list_item_desc: "", unit_price: "0", qty_per_unit: "1", wastage_pct: "0" }] });
    setShowForm(true);
  }

  async function startEdit(rate: CompanyLibraryRate) {
    setEditingId(rate.id);
    try {
      const full = await getLibraryRate(rate.id);
      setForm({
        code: full.code, description: full.description, trade: full.trade ?? "",
        discipline: full.discipline ?? "",
        unit: full.unit, mode: full.mode,
        base_rate: String(full.base_rate ?? 0),
        wastage_pct: String(full.wastage_pct ?? 0),
        productivity_factor: String(full.productivity_factor ?? 1),
        notes: full.notes ?? "",
        lines: full.lines.map((l) => ({
          _key: newKey(), category: l.category,
          price_list_item_code: l.price_list_item_code ?? "",
          price_list_item_desc: l.price_list_item_desc,
          unit_price: String(l.unit_price),
          qty_per_unit: String(l.qty_per_unit),
          wastage_pct: String(l.wastage_pct ?? 0),
        })),
      });
      setShowForm(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rate");
    }
  }

  function addLine() {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { _key: newKey(), category: "material", price_list_item_code: "", price_list_item_desc: "", unit_price: "0", qty_per_unit: "1", wastage_pct: "0" }],
    }));
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setForm((prev) => ({ ...prev, lines: prev.lines.map((l) => l._key === key ? { ...l, ...patch } : l) }));
  }

  function removeLine(key: string) {
    setForm((prev) => ({ ...prev, lines: prev.lines.filter((l) => l._key !== key) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const ratePayload = {
        tenant_id: "",
        code: form.code.trim(),
        description: form.description.trim(),
        trade: form.trade.trim() || null,
        discipline: form.discipline.trim() || null,
        unit: form.unit || "ea",
        mode: form.mode,
        base_rate: form.mode === "flat" ? (parseFloat(form.base_rate) || 0) : null,
        wastage_pct: parseFloat(form.wastage_pct) || 0,
        productivity_factor: liveProdFactor,
        net_rate: liveNetRate,
        category_tags: null,
        region: null,
        source_project_id: null,
        is_active: true,
        notes: form.notes.trim() || null,
      };

      const linesPayload = form.mode === "buildup"
        ? form.lines.filter((l) => l.price_list_item_desc.trim()).map((l, i) => ({
            category: l.category,
            price_list_item_code: l.price_list_item_code.trim() || null,
            price_list_item_desc: l.price_list_item_desc.trim(),
            unit_price: parseFloat(l.unit_price) || 0,
            qty_per_unit: parseFloat(l.qty_per_unit) || 0,
            wastage_pct: l.category === "material" ? (parseFloat(l.wastage_pct) || 0) : 0,
            sort_order: i,
          }))
        : [];

      if (editingId) {
        await updateLibraryRate(editingId, ratePayload, linesPayload);
        toast.success("Library rate updated");
      } else {
        await createLibraryRate(ratePayload, linesPayload);
        toast.success("Library rate created");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save rate");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const count = usageCounts[id] ?? 0;
    if (count > 0) {
      toast.warning(`Used by ${count} tender rate(s) — deactivate instead`);
      await updateLibraryRate(id, { is_active: false });
      toast.success("Rate deactivated");
      load();
      return;
    }
    setDeletingId(id);
    try {
      await deleteLibraryRate(id);
      toast.success("Library rate deleted");
      setRates((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rate");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleExpand(rate: CompanyLibraryRate) {
    if (expandedRate === rate.id) { setExpandedRate(null); return; }
    setExpandedRate(rate.id);
    if (!rateDetails[rate.id]) {
      try {
        const [detail, count] = await Promise.all([getLibraryRate(rate.id), getLibraryRateUsageCount(rate.id)]);
        setRateDetails((prev) => ({ ...prev, [rate.id]: detail }));
        setUsageCounts((prev) => ({ ...prev, [rate.id]: count }));
      } catch { /* silent */ }
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-2">{rates.length} rate(s)</span>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code/description..." className="h-7 rounded-lg border border-border bg-background pl-7 pr-2 text-xs" />
        </div>

        {trades.length > 0 && (
          <select value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)} className="h-7 rounded-lg border border-border bg-background px-2 text-xs">
            <option value="">All trades</option>
            {trades.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        <select value={disciplineFilter} onChange={(e) => setDisciplineFilter(e.target.value)} className="h-7 rounded-lg border border-border bg-background px-2 text-xs">
          <option value="">All disciplines</option>
          {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <Button size="sm" onClick={startCreate} className="ml-auto">
          <Plus className="mr-1 h-3.5 w-3.5" /> Add to Library
        </Button>
      </div>

      {/* Editor Form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Code *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="LIB-CON-001" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Unit *</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Trade</label>
              <input value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Concrete, Rebar..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Discipline</label>
              <select value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">— None —</option>
                {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Productivity Factor</label>
              <input type="number" step="0.01" min="0.01" value={form.productivity_factor} onChange={(e) => setForm({ ...form, productivity_factor: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium">Description *</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Mode</label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["flat", "buildup"] as const).map((m) => (
                  <button key={m} onClick={() => setForm({ ...form, mode: m })}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${form.mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                    {MODE_BADGES[m].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Flat mode */}
          {form.mode === "flat" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Base Rate *</label>
                <input type="number" step="0.01" value={form.base_rate} onChange={(e) => setForm({ ...form, base_rate: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Wastage %</label>
                <input type="number" step="0.1" value={form.wastage_pct} onChange={(e) => setForm({ ...form, wastage_pct: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Net Rate</label>
                <div className="flex items-center rounded-lg border border-border bg-muted px-3 py-2 text-sm font-semibold">{fmt(liveNetRate)}</div>
              </div>
            </div>
          )}

          {/* Build-up mode */}
          {form.mode === "buildup" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-xs">Category</th>
                      <th className="text-left px-3 py-1.5 font-medium text-xs">Item Code</th>
                      <th className="text-left px-3 py-1.5 font-medium text-xs">Description</th>
                      <th className="text-right px-3 py-1.5 font-medium text-xs w-24">Unit Price</th>
                      <th className="text-right px-3 py-1.5 font-medium text-xs w-24">Qty/Unit</th>
                      <th className="text-right px-3 py-1.5 font-medium text-xs w-20">Wastage %</th>
                      <th className="text-right px-3 py-1.5 font-medium text-xs w-28">Line Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.lines.map((line) => {
                      const lineTotal = computeLineTotal(line);
                      return (
                        <tr key={line._key}>
                          <td className="px-2 py-1.5">
                            <select value={line.category} onChange={(e) => updateLine(line._key, { category: e.target.value as LineDraft["category"] })}
                              className="rounded border border-border bg-background px-2 py-1 text-xs">
                              <option value="material">Material</option>
                              <option value="labor">Labor</option>
                              <option value="plant">Plant</option>
                              <option value="subcon">Subcon</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={line.price_list_item_code} onChange={(e) => updateLine(line._key, { price_list_item_code: e.target.value })}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs" placeholder="PL-CEM-01" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input value={line.price_list_item_desc} onChange={(e) => updateLine(line._key, { price_list_item_desc: e.target.value })}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-xs" placeholder="Cement, bag 50kg" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(line._key, { unit_price: e.target.value })}
                              className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input type="number" step="0.001" value={line.qty_per_unit} onChange={(e) => updateLine(line._key, { qty_per_unit: e.target.value })}
                              className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {line.category === "material" ? (
                              <input type="number" step="0.1" value={line.wastage_pct} onChange={(e) => updateLine(line._key, { wastage_pct: e.target.value })}
                                className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-xs" />
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-semibold">{fmt(lineTotal)}</td>
                          <td className="px-1 py-1.5">
                            <button onClick={() => removeLine(line._key)} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-3.5 w-3.5" /> Add Line</Button>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Material:</span> <span className="font-semibold ml-1">{fmt(liveMaterialSub)}</span></div>
                  <div><span className="text-muted-foreground">Labor+Plant:</span> <span className="font-semibold ml-1">{fmt(liveLaborPlantSub)}</span></div>
                  <div><span className="text-muted-foreground">÷ Prod ({liveProdFactor}):</span> <span className="font-semibold ml-1">{fmt(liveLaborPlantSub / liveProdFactor)}</span></div>
                  <div><span className="text-muted-foreground font-medium">Net Rate:</span> <span className="font-bold text-primary ml-1 text-base">{fmt(liveNetRate)}</span></div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.code.trim() || !form.description.trim()}>
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{editingId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      )}

      {/* Rate List */}
      {rates.length === 0 && !showForm ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No library rates yet — add rates to share across tenders</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-8" />
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-left px-3 py-2 font-medium">Trade</th>
                <th className="text-left px-3 py-2 font-medium">Discipline</th>
                <th className="text-left px-3 py-2 font-medium">Unit</th>
                <th className="text-center px-3 py-2 font-medium">Mode</th>
                <th className="text-right px-3 py-2 font-medium">Net Rate</th>
                <th className="text-center px-3 py-2 font-medium">Used By</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rates.map((rate) => (
                <Fragment key={rate.id}>
                  <tr>
                    <td className="px-1 py-2 text-center">
                      <button onClick={() => toggleExpand(rate)} className="text-muted-foreground hover:text-foreground">
                        {expandedRate === rate.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{rate.code}</td>
                    <td className="px-3 py-2">{rate.description}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{rate.trade ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{rate.discipline ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{rate.unit}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${MODE_BADGES[rate.mode]?.cls ?? ""}`}>
                        {MODE_BADGES[rate.mode]?.label ?? rate.mode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(rate.net_rate)}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">{usageCounts[rate.id] ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(rate)} title="Edit">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(rate.id)}>
                          {deletingId === rate.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedRate === rate.id && rateDetails[rate.id] && (
                    <tr>
                      <td colSpan={10} className="px-6 py-3 bg-muted/20">
                        <div className="text-xs space-y-1">
                          <span className="font-medium text-muted-foreground">Build-up composition:</span>
                          {rateDetails[rate.id]!.lines.map((l) => (
                            <div key={l.id} className="flex items-center gap-3">
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{l.category}</span>
                              <span className="font-mono">{l.price_list_item_code || "—"}</span>
                              <span>{l.price_list_item_desc}</span>
                              <span className="text-muted-foreground">× {l.qty_per_unit} {l.unit_price ? `@ ${fmt(l.unit_price)}` : ""} {l.category === "material" && l.wastage_pct ? `(+${l.wastage_pct}%)` : ""}</span>
                              <span className="ml-auto font-semibold">{fmt(l.line_total)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
