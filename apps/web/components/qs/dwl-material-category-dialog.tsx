"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Boxes, CheckSquare, Layers, Loader2, Pencil, Plus, RotateCcw, Sparkles, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DWL_CATEGORY_COLORS,
  DWL_DISCIPLINES,
  type DwlCategoryColor,
  type DwlMaterialCategory,
} from "@/components/qs/dwl-types";

interface DwlMaterialCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called whenever categories or a material's category assignment changes,
  // so the caller (Material Master list, material form's Category select)
  // can reload its own copy and refresh the header count badge.
  onChanged: () => void;
}

type DialogTab = "list" | "create" | "batch";

interface MaterialLite {
  resource_id: string;
  code: string;
  material_name: string;
  category_id: string | null;
  category_name: string | null;
  application_element: string | null;
  discipline: string | null;
  is_active: boolean;
}

const COLOR_CLASSES: Record<DwlCategoryColor, { dot: string; badge: string; ring: string }> = {
  emerald:  { dot: "bg-emerald-400",  badge: "border-emerald-200 bg-emerald-50 text-emerald-700",   ring: "ring-emerald-500" },
  sky:      { dot: "bg-sky-400",      badge: "border-sky-200 bg-sky-50 text-sky-700",               ring: "ring-sky-500" },
  indigo:   { dot: "bg-indigo-400",   badge: "border-indigo-200 bg-indigo-50 text-indigo-700",       ring: "ring-indigo-500" },
  violet:   { dot: "bg-violet-400",   badge: "border-violet-200 bg-violet-50 text-violet-700",       ring: "ring-violet-500" },
  amber:    { dot: "bg-amber-400",    badge: "border-amber-200 bg-amber-50 text-amber-700",          ring: "ring-amber-500" },
  orange:   { dot: "bg-orange-400",   badge: "border-orange-200 bg-orange-50 text-orange-700",       ring: "ring-orange-500" },
  rose:     { dot: "bg-rose-400",     badge: "border-rose-200 bg-rose-50 text-rose-700",             ring: "ring-rose-500" },
  teal:     { dot: "bg-teal-400",     badge: "border-teal-200 bg-teal-50 text-teal-700",             ring: "ring-teal-500" },
  mint:     { dot: "bg-green-300",    badge: "border-green-200 bg-green-50 text-green-700",          ring: "ring-green-500" },
  lavender: { dot: "bg-purple-300",   badge: "border-purple-200 bg-purple-50 text-purple-700",       ring: "ring-purple-500" },
  slate:    { dot: "bg-slate-400",    badge: "border-slate-200 bg-slate-50 text-slate-700",          ring: "ring-slate-500" },
};

function colorClasses(tag: string | null | undefined) {
  return COLOR_CLASSES[(tag as DwlCategoryColor) ?? "slate"] ?? COLOR_CLASSES.slate;
}

// Display-only cleanup for legacy-migration text — strips the leading
// "Material component (migrated) for " boilerplate and the trailing
// "(source: qs_cost_items.code='03 20 13')" note that some seeded/migrated
// rows carry in material_name — never touches the stored data. Mirrors the
// same helper in dwl-materials-list-page.tsx and dwl-material-detail-page.tsx.
function cleanLabel(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/^material component \(migrated\) for\s*/i, "")
    .replace(/\s*\(source:[^)]*\)/gi, "")
    .trim();
}

const SELECT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const TEXTAREA_CLASS =
  "w-full min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const EMPTY_FORM = {
  name: "",
  code: "",
  specific_element: "",
  discipline: "Architectural" as (typeof DWL_DISCIPLINES)[number],
  cost_code_prefix: "",
  color_tag: "violet" as DwlCategoryColor,
  description: "",
};

export function DwlMaterialCategoryDialog({ open, onOpenChange, onChanged }: DwlMaterialCategoryDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<DialogTab>("list");

  const [categories, setCategories] = useState<DwlMaterialCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [totalMaterials, setTotalMaterials] = useState(0);
  const [elementOptions, setElementOptions] = useState<string[]>([]);

  // --- All Categories tab state ---
  const [listSearch, setListSearch] = useState("");
  const [listElementFilter, setListElementFilter] = useState("all");

  // --- Create / Edit Category tab state ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // --- Batch Assign tab state ---
  const [batchCategoryId, setBatchCategoryId] = useState("");
  const [materials, setMaterials] = useState<MaterialLite[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const loadCategories = useMemo(
    () => async () => {
      setCategoriesLoading(true);
      const { data, error } = await supabase
        .from("dwl_material_categories")
        .select(
          "id, group_name, name, code, specific_element, discipline, cost_code_prefix, color_tag, description, sort_order, is_active, created_at, updated_at"
        )
        .order("sort_order")
        .order("name");
      if (error) {
        toast.error(`Failed to load categories: ${error.message}`);
      } else {
        setCategories((data ?? []) as DwlMaterialCategory[]);
      }
      setCategoriesLoading(false);
    },
    [supabase]
  );

  const loadCounts = useMemo(
    () => async () => {
      const [attrRes, totalRes, elRes] = await Promise.all([
        supabase.from("dwl_material_attributes").select("category_id"),
        supabase.from("dwl_resources").select("id", { count: "exact", head: true }).eq("category", "material"),
        supabase.from("qs_element_library").select("sub_element").eq("is_active", true),
      ]);
      const counts: Record<string, number> = {};
      for (const row of (attrRes.data ?? []) as { category_id: string | null }[]) {
        if (!row.category_id) continue;
        counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
      }
      setAssignedCounts(counts);
      setTotalMaterials(totalRes.count ?? 0);
      const els = new Set<string>();
      for (const row of (elRes.data ?? []) as { sub_element: string }[]) {
        if (row.sub_element) els.add(row.sub_element);
      }
      setElementOptions(Array.from(els).sort());
    },
    [supabase]
  );

  const loadMaterials = useMemo(
    () => async () => {
      setMaterialsLoading(true);
      const { data, error } = await supabase
        .from("dwl_v_materials")
        .select("resource_id, code, material_name, category_id, category_name, application_element, discipline, is_active")
        .order("code");
      if (error) {
        toast.error(`Failed to load materials: ${error.message}`);
      } else {
        setMaterials((data ?? []) as MaterialLite[]);
      }
      setMaterialsLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab("list");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setBatchCategoryId("");
    setMaterialSearch("");
    setSelected(new Set());
    void loadCategories();
    void loadCounts();
    void loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTab("create");
  }

  function startEdit(cat: DwlMaterialCategory) {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      code: cat.code ?? "",
      specific_element: cat.specific_element ?? "",
      discipline: (cat.discipline as (typeof DWL_DISCIPLINES)[number]) ?? "Architectural",
      cost_code_prefix: cat.cost_code_prefix ?? "",
      color_tag: (cat.color_tag as DwlCategoryColor) ?? "violet",
      description: cat.description ?? "",
    });
    setTab("create");
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name) {
      toast.error("Category name is required");
      return;
    }
    if (!form.specific_element.trim()) {
      toast.error("Specific Element is required");
      return;
    }
    setSaving(true);
    const payload = {
      name,
      code: form.code.trim() || null,
      specific_element: form.specific_element.trim(),
      discipline: form.discipline,
      cost_code_prefix: form.cost_code_prefix.trim() || null,
      color_tag: form.color_tag,
      description: form.description.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("dwl_material_categories").update(payload).eq("id", editingId);
      setSaving(false);
      if (error) {
        toast.error(error.code === "23505" || /unique/i.test(error.message) ? "A category with this code already exists" : error.message);
        return;
      }
      toast.success(`Category "${name}" updated`);
    } else {
      const nextSort = categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 10;
      const { error } = await supabase
        .from("dwl_material_categories")
        .insert({ ...payload, sort_order: nextSort, is_active: true });
      setSaving(false);
      if (error) {
        toast.error(error.code === "23505" || /unique/i.test(error.message) ? "A category with this code already exists" : error.message);
        return;
      }
      toast.success(`Category "${name}" created`);
    }

    await loadCategories();
    onChanged();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTab("list");
  }

  async function handleToggleActive(cat: DwlMaterialCategory) {
    const { error } = await supabase.from("dwl_material_categories").update({ is_active: !cat.is_active }).eq("id", cat.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadCategories();
    onChanged();
  }

  async function handleResetDefaults() {
    // Non-destructive: only adds back any of the 22 starter categories (by
    // code) that are missing — never deletes or overwrites a category an
    // admin has already created or edited. Mirrors the seed rows in
    // migrations 20260910000026 and 20260910000027.
    const defaults: { name: string; code: string; specific_element: string; discipline: string; cost_code_prefix: string; color_tag: DwlCategoryColor }[] = [
      { name: "Finishes - Ceiling", code: "CAT-CEIL", specific_element: "Ceiling", discipline: "Architectural", cost_code_prefix: "09-5100", color_tag: "emerald" },
      { name: "Finishes - Painting", code: "CAT-PNT", specific_element: "Painting", discipline: "Architectural", cost_code_prefix: "09-9100", color_tag: "sky" },
      { name: "Finishes - Tiling", code: "CAT-TILE", specific_element: "Tiling", discipline: "Architectural", cost_code_prefix: "09-3000", color_tag: "teal" },
      { name: "Finishes - Marble & Stone", code: "CAT-MRBL", specific_element: "Marble & Stone", discipline: "Architectural", cost_code_prefix: "09-3800", color_tag: "amber" },
      { name: "Openings - Door", code: "CAT-DOOR", specific_element: "Door", discipline: "Architectural", cost_code_prefix: "08-1100", color_tag: "orange" },
      { name: "Openings - Window", code: "CAT-WNDW", specific_element: "Window", discipline: "Architectural", cost_code_prefix: "08-5100", color_tag: "sky" },
      { name: "Thermal & Waterproofing", code: "CAT-WPRF", specific_element: "Waterproofing", discipline: "Architectural", cost_code_prefix: "07-1000", color_tag: "indigo" },
      { name: "Site - Anti-Mite / Termite", code: "CAT-MITE", specific_element: "Anti-Mite / Termite", discipline: "Civil/Structural", cost_code_prefix: "02-3100", color_tag: "rose" },
      { name: "Finishes - Carpet", code: "CAT-CRPT", specific_element: "Carpet", discipline: "Architectural", cost_code_prefix: "09-6800", color_tag: "mint" },
      { name: "Finishes - Raised Floor", code: "CAT-RFLR", specific_element: "Raised Floor", discipline: "Architectural", cost_code_prefix: "09-6900", color_tag: "lavender" },
      { name: "Structural - Concrete & Cement", code: "CAT-CONC", specific_element: "Structural Framing", discipline: "Civil/Structural", cost_code_prefix: "03-3000", color_tag: "slate" },
      { name: "Structural - Metals & Rebar", code: "CAT-METL", specific_element: "Structural Framing", discipline: "Civil/Structural", cost_code_prefix: "03-2100", color_tag: "slate" },
      { name: "Masonry & Plaster", code: "CAT-MASN", specific_element: "Masonry & Plaster", discipline: "Civil/Structural", cost_code_prefix: "04-2000", color_tag: "amber" },
      { name: "MEP - Plumbing & Drainage", code: "CAT-PLMB", specific_element: "Plumbing & Drainage", discipline: "MEP", cost_code_prefix: "22-1000", color_tag: "amber" },
      { name: "MEP - Electrical & Lighting", code: "CAT-ELEC", specific_element: "Electrical & Lighting", discipline: "MEP", cost_code_prefix: "26-0500", color_tag: "amber" },
      { name: "Finishes - Glass & Glazing", code: "CAT-GLZ", specific_element: "Glass & Glazing", discipline: "Architectural", cost_code_prefix: "08-8000", color_tag: "teal" },
      { name: "Thermal & Acoustic Insulation", code: "CAT-INS", specific_element: "Thermal & Acoustic Insulation", discipline: "Architectural", cost_code_prefix: "07-2100", color_tag: "amber" },
      { name: "Openings - Ironmongery & Hardware", code: "CAT-HRD", specific_element: "Ironmongery & Hardware", discipline: "Architectural", cost_code_prefix: "08-7100", color_tag: "slate" },
      { name: "Finishes - Resilient & Timber Flooring", code: "CAT-FLR", specific_element: "Flooring", discipline: "Architectural", cost_code_prefix: "09-6500", color_tag: "teal" },
      { name: "Building Envelope - Facade & Cladding", code: "CAT-FAC", specific_element: "Facade & Cladding", discipline: "Architectural", cost_code_prefix: "07-4000", color_tag: "sky" },
      { name: "MEP - Sanitary & Plumbing", code: "CAT-SAN", specific_element: "Sanitary & Plumbing", discipline: "MEP", cost_code_prefix: "22-4000", color_tag: "slate" },
      { name: "Building Envelope - Roofing Systems", code: "CAT-ROOF", specific_element: "Roofing", discipline: "Architectural", cost_code_prefix: "07-3100", color_tag: "orange" },
    ];
    const existingCodes = new Set(categories.map((c) => c.code).filter(Boolean));
    const missing = defaults.filter((d) => !existingCodes.has(d.code));
    if (missing.length === 0) {
      toast.info("All default categories are already present");
      return;
    }
    const nextSort = categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 10;
    const { error } = await supabase
      .from("dwl_material_categories")
      .insert(missing.map((d, i) => ({ ...d, sort_order: nextSort + i * 10, is_active: true })));
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Restored ${missing.length} default categor${missing.length === 1 ? "y" : "ies"}`);
    await loadCategories();
    onChanged();
  }

  async function handleApplyBatch() {
    if (!batchCategoryId) {
      toast.error("Choose a target category first");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one material");
      return;
    }
    setApplying(true);
    const { error } = await supabase
      .from("dwl_material_attributes")
      .update({ category_id: batchCategoryId })
      .in("resource_id", Array.from(selected));
    setApplying(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const catName = categories.find((c) => c.id === batchCategoryId)?.name ?? "category";
    toast.success(`Assigned ${selected.size} material${selected.size === 1 ? "" : "s"} to "${catName}"`);
    setSelected(new Set());
    await Promise.all([loadMaterials(), loadCounts()]);
    onChanged();
  }

  const listElements = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories) if (c.specific_element) set.add(c.specific_element);
    return Array.from(set).sort();
  }, [categories]);

  const filteredCategories = useMemo(() => {
    let result = categories;
    if (listElementFilter !== "all") result = result.filter((c) => c.specific_element === listElementFilter);
    if (listSearch.trim()) {
      const q = listSearch.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.code?.toLowerCase().includes(q) ?? false) ||
          (c.specific_element?.toLowerCase().includes(q) ?? false) ||
          (c.cost_code_prefix?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [categories, listElementFilter, listSearch]);

  const filteredMaterials = useMemo(() => {
    if (!materialSearch.trim()) return materials;
    const q = materialSearch.trim().toLowerCase();
    return materials.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.material_name.toLowerCase().includes(q) ||
        (m.category_name?.toLowerCase().includes(q) ?? false)
    );
  }, [materials, materialSearch]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeCount = categories.filter((c) => c.is_active).length;
  const previewColors = colorClasses(form.color_tag);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2">
                Category &amp; Specific Element Management
                <Badge variant="secondary" className="bg-violet-100 text-violet-700">{activeCount} Defined</Badge>
              </DialogTitle>
              <DialogDescription>
                Organize finishing &amp; structural materials by specific elements (Ceiling, Painting, Tiling, Waterproofing, etc.)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab("list")}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                tab === "list" ? "border-violet-600 text-violet-700" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Boxes className="h-3.5 w-3.5" /> All Categories ({categories.length})
            </button>
            <button
              type="button"
              onClick={startCreate}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                tab === "create" ? "border-violet-600 text-violet-700" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Plus className="h-3.5 w-3.5" /> {editingId ? "Edit Category" : "Create Custom Category"}
            </button>
            <button
              type="button"
              onClick={() => setTab("batch")}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                tab === "batch" ? "border-violet-600 text-violet-700" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" /> Batch Assign to Materials
            </button>
          </div>
          {tab === "list" && (
            <button
              type="button"
              onClick={() => void handleResetDefaults()}
              className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Reset Defaults
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {tab === "list" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Search category name, code, specific element, cost code..."
                  className="max-w-sm"
                />
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Specific Element:</span>
                  <select value={listElementFilter} onChange={(e) => setListElementFilter(e.target.value)} className={cn(SELECT_CLASS, "w-auto")}>
                    <option value="all">All Elements</option>
                    {listElements.map((el) => <option key={el} value={el}>{el}</option>)}
                  </select>
                </div>
                <Button type="button" size="sm" className="ml-auto bg-violet-600 hover:bg-violet-700" onClick={startCreate}>
                  <Plus className="h-3.5 w-3.5" /> Add Custom
                </Button>
              </div>

              {categoriesLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
              ) : filteredCategories.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No categories match — add one with &quot;Add Custom&quot;.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Category Name &amp; Code</th>
                        <th className="px-3 py-2 text-left font-medium">Specific Element</th>
                        <th className="px-3 py-2 text-left font-medium">Discipline</th>
                        <th className="px-3 py-2 text-left font-medium">Cost Code Prefix</th>
                        <th className="px-3 py-2 text-left font-medium">Assigned Items</th>
                        <th className="px-3 py-2 text-left font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredCategories.map((cat) => {
                        const colors = colorClasses(cat.color_tag);
                        return (
                          <tr key={cat.id} className={cn(!cat.is_active && "opacity-50")}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2 w-2 shrink-0 rounded-full", colors.dot)} />
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{cat.name}</p>
                                  {cat.code && <p className="font-mono text-xs text-muted-foreground">{cat.code}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {cat.specific_element ? (
                                <Badge variant="outline" className={colors.badge}>{cat.specific_element}</Badge>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{cat.discipline ?? "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{cat.cost_code_prefix ?? "—"}</td>
                            <td className="px-3 py-2">
                              <Badge variant="secondary">{assignedCounts[cat.id] ?? 0}</Badge>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => startEdit(cat)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  title={cat.is_active ? "Deactivate" : "Activate"}
                                  onClick={() => void handleToggleActive(cat)}
                                >
                                  {cat.is_active ? <X className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "create" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-violet-800">
                  <Sparkles className="h-3.5 w-3.5" /> {editingId ? "Edit Category" : "Define New Custom Category"}
                </p>
                <p className="mt-0.5 text-xs text-violet-700/80">
                  Define high-level classification and link it to construction elements like Ceiling, Painting, Tiling, Waterproofing, etc.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cat_name">Category Name *</Label>
                  <Input
                    id="cat_name"
                    placeholder="e.g. Finishes - Ceiling or Specialized Waterproofing"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cat_code">Category Code</Label>
                  <Input
                    id="cat_code"
                    placeholder="e.g. CAT-CEIL"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cat_element">Specific Element *</Label>
                  <Input
                    id="cat_element"
                    list="dwl-category-element-options"
                    placeholder="e.g. Ceiling"
                    value={form.specific_element}
                    onChange={(e) => setForm((f) => ({ ...f, specific_element: e.target.value }))}
                  />
                  <datalist id="dwl-category-element-options">
                    {elementOptions.map((el) => <option key={el} value={el} />)}
                  </datalist>
                  <p className="text-xs text-muted-foreground">Directly associates materials with this functional element for cost tracking.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cat_discipline">Discipline</Label>
                  <select
                    id="cat_discipline"
                    value={form.discipline}
                    onChange={(e) => setForm((f) => ({ ...f, discipline: e.target.value as (typeof DWL_DISCIPLINES)[number] }))}
                    className={SELECT_CLASS}
                  >
                    {DWL_DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cat_cost_code">Default Cost Code Prefix</Label>
                  <Input
                    id="cat_cost_code"
                    placeholder="e.g. 09-5100"
                    value={form.cost_code_prefix}
                    onChange={(e) => setForm((f) => ({ ...f, cost_code_prefix: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Color Palette Tag</Label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {DWL_CATEGORY_COLORS.map((c) => {
                      const cc = colorClasses(c);
                      const selectedColor = form.color_tag === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          onClick={() => setForm((f) => ({ ...f, color_tag: c }))}
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background",
                            cc.dot,
                            selectedColor && cn("ring-2", cc.ring)
                          )}
                        >
                          {selectedColor && <CheckSquare className="h-3 w-3 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="cat_desc">Description &amp; Specifications</Label>
                <textarea
                  id="cat_desc"
                  className={TEXTAREA_CLASS}
                  placeholder="Brief scope of materials falling under this category..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3">
                <span className="text-xs text-muted-foreground">Live Badge Preview:</span>
                <Badge variant="outline" className={previewColors.badge}>
                  {form.name.trim() || "Category Preview"} • {form.specific_element.trim() || "Element"}
                </Badge>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setTab("list"); }}>
                  Cancel
                </Button>
                <Button type="button" className="bg-violet-600 hover:bg-violet-700" disabled={saving} onClick={() => void handleSave()}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Category"}
                </Button>
              </div>
            </div>
          )}

          {tab === "batch" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">Step 1: Select Target Category to Assign</p>
                <div className="flex items-center gap-2">
                  <select value={batchCategoryId} onChange={(e) => setBatchCategoryId(e.target.value)} className={cn(SELECT_CLASS, "max-w-xs")}>
                    <option value="">-- Choose Category --</option>
                    {categories.filter((c) => c.is_active).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                    disabled={applying || !batchCategoryId || selected.size === 0}
                    onClick={() => void handleApplyBatch()}
                  >
                    {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                    Apply to {selected.size} Selected Material{selected.size === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  placeholder="Search materials to select..."
                  className="max-w-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(new Set(filteredMaterials.map((m) => m.resource_id)))}
                >
                  Select All Filtered ({filteredMaterials.length})
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelected(new Set())}>
                  Deselect All
                </Button>
              </div>

              {materialsLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2 text-left font-medium">Code</th>
                        <th className="px-3 py-2 text-left font-medium">Material Name</th>
                        <th className="px-3 py-2 text-left font-medium">Current Category</th>
                        <th className="px-3 py-2 text-left font-medium">Specific Element</th>
                        <th className="px-3 py-2 text-left font-medium">Discipline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredMaterials.map((m) => (
                        <tr
                          key={m.resource_id}
                          className={cn("cursor-pointer hover:bg-muted/30", !m.is_active && "opacity-50")}
                          onClick={() => toggleSelected(m.resource_id)}
                        >
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selected.has(m.resource_id)} onCheckedChange={() => toggleSelected(m.resource_id)} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{m.code}</td>
                          <td className="px-3 py-2">{cleanLabel(m.material_name)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.category_name ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.application_element ?? "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.discipline ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {activeCount} categories active • {totalMaterials} total materials in library
          </p>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
