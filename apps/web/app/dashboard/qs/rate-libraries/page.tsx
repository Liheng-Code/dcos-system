"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2, Pencil, BookTemplate, Check, X, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";

type Discipline = "STR" | "MEP" | "ARC";
type Category = "material" | "labor" | "plant";

interface RateItem {
  id: string;
  discipline: Discipline;
  code: string;
  description: string;
  category: Category;
  unit: string;
  unit_price: number;
  currency: string;
  supplier_name: string | null;
  quote_ref: string | null;
  quote_date: string | null;
  valid_until: string | null;
  is_active: boolean;
  notes: string | null;
}

const DISCIPLINES: { key: Discipline; label: string; color: string }[] = [
  { key: "STR", label: "Structure", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "MEP", label: "Mech / Elec / Plumbing", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "ARC", label: "Architecture", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

const CATEGORIES: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "All Categories" },
  { key: "material", label: "Material" },
  { key: "labor", label: "Labor" },
  { key: "plant", label: "Plant" },
];

export default function RateLibrariesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();
  const [items, setItems] = useState<RateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [discipline, setDiscipline] = useState<Discipline>("STR");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyForm = {
    code: "", description: "", category: "material" as Category,
    unit: "ea", unit_price: "", supplier_name: "", notes: "",
  };
  const [form, setForm] = useState(emptyForm);

  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  useEffect(() => {
    supabase.from("rate_libraries").select("*").order("code").then(({ data }) => {
      if (data) setItems(data as RateItem[]);
      setLoading(false);
    });
  }, [supabase]);

  const filtered = useMemo(() => {
    let result = items.filter((i) => i.discipline === discipline);
    if (categoryFilter !== "all") result = result.filter((i) => i.category === categoryFilter);
    if (activeFilter === "active") result = result.filter((i) => i.is_active);
    if (activeFilter === "inactive") result = result.filter((i) => !i.is_active);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) =>
        i.code.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        (i.supplier_name && i.supplier_name.toLowerCase().includes(q)) ||
        (i.notes && i.notes.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, discipline, search, categoryFilter, activeFilter]);

  const stats = useMemo(() => {
    const disc = items.filter((i) => i.discipline === discipline);
    return {
      total: disc.length,
      active: disc.filter((i) => i.is_active).length,
      materials: disc.filter((i) => i.category === "material").length,
      labor: disc.filter((i) => i.category === "labor").length,
      plant: disc.filter((i) => i.category === "plant").length,
      avgPrice: disc.length ? (disc.reduce((s, i) => s + i.unit_price, 0) / disc.length) : 0,
    };
  }, [items, discipline]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(item: RateItem) {
    setEditingId(item.id);
    setForm({
      code: item.code,
      description: item.description,
      category: item.category,
      unit: item.unit,
      unit_price: String(item.unit_price),
      supplier_name: item.supplier_name ?? "",
      notes: item.notes ?? "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.description.trim()) {
      toast.error("Code and description are required");
      return;
    }
    setSaving(true);
    const payload = {
      discipline,
      code: form.code.trim(),
      description: form.description.trim(),
      category: form.category,
      unit: form.unit,
      unit_price: parseFloat(form.unit_price) || 0,
      supplier_name: form.supplier_name.trim() || null,
      notes: form.notes.trim() || null,
      quote_ref: "MKT-2026Q2",
      quote_date: "2026-07-01",
      valid_until: "2026-09-30",
    };

    const { error } = editingId
      ? await supabase.from("rate_libraries").update(payload).eq("id", editingId)
      : await supabase.from("rate_libraries").insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editingId ? "Rate updated" : "Rate added");
    setShowForm(false);
    setEditingId(null);
    const { data } = await supabase.from("rate_libraries").select("*").order("code");
    if (data) setItems(data as RateItem[]);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this rate?")) return;
    setDeletingId(id);
    const { error } = await supabase.from("rate_libraries").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Rate deleted");
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeletingId(null);
  }

  async function handleToggleActive(item: RateItem) {
    const { error } = await supabase.from("rate_libraries").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_active: !i.is_active } : i));
  }

  async function handlePriceSave(id: string) {
    const price = parseFloat(editingPriceValue);
    if (isNaN(price)) { toast.error("Invalid price"); return; }
    const { error } = await supabase.from("rate_libraries").update({ unit_price: price }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, unit_price: price } : i));
    setEditingPriceId(null);
  }

  const catColor = (c: Category) =>
    c === "material" ? "bg-blue-50 text-blue-600 border-blue-200" :
    c === "labor" ? "bg-violet-50 text-violet-600 border-violet-200" :
    "bg-orange-50 text-orange-600 border-orange-200";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rate Libraries</h1>
          <p className="text-sm text-muted-foreground">Cambodia Market Rates — Q2-2026 Indicative</p>
        </div>
        <Button onClick={() => (showForm ? setShowForm(false) : openCreate())} size="sm" disabled={!can("qs_libraries", "can_create")}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Rate
        </Button>
      </div>

      {/* Discipline Tabs */}
      <div className="flex gap-2">
        {DISCIPLINES.map((d) => (
          <button key={d.key} onClick={() => { setDiscipline(d.key); setSearch(""); setCategoryFilter("all"); }}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
              discipline === d.key ? d.color + " border-current" : "border-border text-muted-foreground hover:bg-accent"
            )}>
            {d.label}
            <span className="ml-1 rounded-full bg-background/50 px-1.5 py-0.5 text-[10px] font-semibold">
              {stats.total}
            </span>
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{stats.active} active</span>
        <span>{stats.materials} materials</span>
        <span>{stats.labor} labor</span>
        <span>{stats.plant} plant</span>
        <span>Avg ${stats.avgPrice.toFixed(2)}</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, description, supplier..."
          className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as any)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} items</span>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">{editingId ? "Edit Rate" : "New Rate"} — {discipline}</p>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Code *</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="PL-XXX-01" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description *</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Item description" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="material">Material</option>
                  <option value="labor">Labor</option>
                  <option value="plant">Plant</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Unit</label>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="ea" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Unit Price (USD)</label>
                <input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                  placeholder="0.00" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Supplier</label>
                <input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                  placeholder="Supplier name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Notes</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Notes" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {editingId ? "Update" : "Add"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <BookTemplate className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {search ? "No rates match your search." : "No rates in this discipline yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-28">Code</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-20">Category</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-14">Unit</th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground w-24">Price</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-40">Supplier</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-32">Notes</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground w-16">Active</th>
                <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className={cn("border-b border-border last:border-0 transition-colors hover:bg-muted/20",
                  !item.is_active && "opacity-50")}>
                  <td className="px-3 py-2 font-mono text-xs font-medium">{item.code}</td>
                  <td className="px-3 py-2 text-sm">{item.description}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium", catColor(item.category))}>
                      {item.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{item.unit}</td>
                  <td className="px-3 py-2 text-right">
                    {editingPriceId === item.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" step="0.01" value={editingPriceValue}
                          onChange={(e) => setEditingPriceValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handlePriceSave(item.id); if (e.key === "Escape") setEditingPriceId(null); }}
                          autoFocus
                          className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-right text-xs" />
                        <button onClick={() => handlePriceSave(item.id)} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditingPriceId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingPriceId(item.id); setEditingPriceValue(String(item.unit_price)); }}
                        className="font-mono text-xs font-medium hover:text-blue-600 cursor-pointer">
                        ${item.unit_price.toFixed(2)}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[160px]">{item.supplier_name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[130px]">{item.notes || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {can("qs_libraries", "edit") && (
                      <button onClick={() => handleToggleActive(item)} className="mx-auto flex items-center justify-center">
                        {item.is_active
                          ? <ToggleRight className="h-5 w-5 text-emerald-600" />
                          : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {can("qs_libraries", "edit") && (
                        <button onClick={() => openEdit(item)}
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {can("qs_libraries", "delete") && (
                        <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                          {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
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
