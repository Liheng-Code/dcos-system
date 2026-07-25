"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, Plus, Trash2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useQsPermissions } from "@/hooks/use-qs-permissions";

interface QsElementRow {
  id: string;
  discipline: string;
  section: string;
  sub_section: string;
  sub_element: string;
  budget_code_id: string | null;
  typical_unit: string | null;
  sort_order: number;
  is_active: boolean;
}

interface DescriptionRow {
  id: string;
  element_library_id: string;
  description: string;
  material_rate: number | null;
  labor_rate: number | null;
  in_price_list: boolean;
  sort_order: number;
  is_active: boolean;
}

interface BudgetCodeOption {
  id: string;
  code: string;
  description: string;
}

interface PostgrestLikeError {
  code?: string;
  message: string;
}

function friendlyError(error: PostgrestLikeError): string {
  if (error.code === "23505") {
    return "This combination already exists — discipline, section, sub-section and sub-element must be unique together.";
  }
  return error.message;
}

const inputClass =
  "w-full rounded border border-border bg-background px-2 py-1 text-sm outline-hidden focus:border-primary";

export default function QsElementLibraryPage() {
  const { can } = useQsPermissions();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<QsElementRow[]>([]);
  const [descriptions, setDescriptions] = useState<DescriptionRow[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<BudgetCodeOption[]>([]);
  const [editMap, setEditMap] = useState<Record<string, Partial<QsElementRow>>>({});
  const [descEditMap, setDescEditMap] = useState<Record<string, Partial<DescriptionRow>>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedDescGroups, setExpandedDescGroups] = useState<Set<string>>(new Set());
  const [newItem, setNewItem] = useState({
    discipline: "",
    section: "",
    sub_section: "",
    sub_element: "",
    typical_unit: "",
    budget_code_id: "",
  });
  const [newDesc, setNewDesc] = useState<Record<string, { description: string; in_price_list: boolean; material_rate: string; labor_rate: string }>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const [libRes, codesRes, descRes] = await Promise.all([
        supabase.from("qs_element_library").select("*").order("sort_order"),
        supabase.from("budget_codes").select("id, code, description").eq("is_active", true).order("sort_order"),
        supabase.from("qs_description_library").select("*").order("sort_order"),
      ]);
      if (libRes.error) toast.error("Failed to load QS element library");
      else setItems((libRes.data ?? []) as QsElementRow[]);
      if (codesRes.error) toast.error("Failed to load budget codes");
      else setBudgetCodes((codesRes.data ?? []) as BudgetCodeOption[]);
      if (descRes.error) toast.error("Failed to load description library");
      else setDescriptions((descRes.data ?? []) as DescriptionRow[]);
      setLoading(false);
    }
    load();
  }, [supabase]);

  function updateField<K extends keyof QsElementRow>(id: string, field: K, value: QsElementRow[K]) {
    setEditMap((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isSearching = search.trim() !== "";
  function isExpanded(key: string) {
    return isSearching || expandedGroups.has(key);
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.section.toLowerCase().includes(q) ||
        i.sub_section.toLowerCase().includes(q) ||
        i.sub_element.toLowerCase().includes(q)
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const disciplineMap = new Map<string, Map<string, QsElementRow[]>>();
    for (const item of filteredItems) {
      if (!disciplineMap.has(item.discipline)) disciplineMap.set(item.discipline, new Map());
      const sectionMap = disciplineMap.get(item.discipline)!;
      if (!sectionMap.has(item.section)) sectionMap.set(item.section, []);
      sectionMap.get(item.section)!.push(item);
    }
    return disciplineMap;
  }, [filteredItems]);

  const disciplines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of items) {
      if (!seen.has(i.discipline)) {
        seen.add(i.discipline);
        out.push(i.discipline);
      }
    }
    return out;
  }, [items]);

  async function handleSave(id: string) {
    const changes = editMap[id];
    if (!changes) return;
    setSaving(true);
    const payload: Partial<QsElementRow> = { ...changes };
    if (payload.section !== undefined) payload.section = payload.section.trim();
    if (payload.sub_section !== undefined) payload.sub_section = payload.sub_section.trim();
    if (payload.sub_element !== undefined) payload.sub_element = payload.sub_element.trim();
    if (payload.typical_unit !== undefined) {
      payload.typical_unit = payload.typical_unit && payload.typical_unit.trim() !== "" ? payload.typical_unit.trim() : null;
    }
    const { error } = await supabase.from("qs_element_library").update(payload).eq("id", id);
    if (error) {
      toast.error(friendlyError(error));
    } else {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...payload } : it)));
      setEditMap((prev) => {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
      toast.success("Element updated");
    }
    setSaving(false);
  }

  async function handleAdd() {
    if (!newItem.discipline.trim() || !newItem.section.trim() || !newItem.sub_section.trim() || !newItem.sub_element.trim()) {
      toast.error("Discipline, section, sub-section and sub-element are required");
      return;
    }
    setSaving(true);
    const maxOrder = items.reduce((max, i) => Math.max(max, i.sort_order), 0);
    const { data, error } = await supabase
      .from("qs_element_library")
      .insert({
        discipline: newItem.discipline.trim(),
        section: newItem.section.trim(),
        sub_section: newItem.sub_section.trim(),
        sub_element: newItem.sub_element.trim(),
        typical_unit: newItem.typical_unit.trim() || null,
        budget_code_id: newItem.budget_code_id || null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();
    if (error) {
      toast.error(friendlyError(error));
    } else if (data) {
      setItems((prev) => [...prev, data as QsElementRow]);
      setNewItem((prev) => ({
        discipline: prev.discipline,
        section: "",
        sub_section: "",
        sub_element: "",
        typical_unit: "",
        budget_code_id: "",
      }));
      toast.success("Element added");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this element? BOQ line items that already reference it will keep their frozen values.")) return;
    const { error } = await supabase.from("qs_element_library").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Element deleted");
  }

  async function handleToggleActive(id: string, current: boolean) {
    const { error } = await supabase.from("qs_element_library").update({ is_active: !current }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_active: !current } : i)));
  }

  // ── Description CRUD ──────────────────────────────────────────────────────

  function toggleDescGroup(elementId: string) {
    setExpandedDescGroups((prev) => {
      const next = new Set(prev);
      if (next.has(elementId)) next.delete(elementId);
      else next.add(elementId);
      return next;
    });
  }

  function updateDescField(id: string, field: keyof DescriptionRow, value: DescriptionRow[keyof DescriptionRow]) {
    setDescEditMap((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function handleDescSave(id: string) {
    const changes = descEditMap[id];
    if (!changes) return;
    setSaving(true);
    const payload: Partial<DescriptionRow> = { ...changes };
    if (payload.description !== undefined) payload.description = payload.description.trim();
    const { error } = await supabase.from("qs_description_library").update(payload).eq("id", id);
    if (error) {
      toast.error(error.code === "23505" ? "This description already exists for this element." : error.message);
    } else {
      setDescriptions((prev) => prev.map((d) => (d.id === id ? { ...d, ...payload } : d)));
      setDescEditMap((prev) => { const rest = { ...prev }; delete rest[id]; return rest; });
      toast.success("Description updated");
    }
    setSaving(false);
  }

  async function handleDescAdd(elementId: string) {
    const form = newDesc[elementId];
    if (!form?.description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    const maxOrder = descriptions.filter((d) => d.element_library_id === elementId).reduce((m, d) => Math.max(m, d.sort_order), 0);
    const { data, error } = await supabase
      .from("qs_description_library")
      .insert({
        element_library_id: elementId,
        description: form.description.trim(),
        in_price_list: form.in_price_list,
        material_rate: form.material_rate ? parseFloat(form.material_rate) : null,
        labor_rate: form.labor_rate ? parseFloat(form.labor_rate) : null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.code === "23505" ? "This description already exists for this element." : error.message);
    } else if (data) {
      setDescriptions((prev) => [...prev, data as DescriptionRow]);
      setNewDesc((prev) => ({ ...prev, [elementId]: { description: "", in_price_list: false, material_rate: "", labor_rate: "" } }));
      toast.success("Description added");
    }
    setSaving(false);
  }

  async function handleDescDelete(id: string) {
    if (!confirm("Delete this description?")) return;
    const { error } = await supabase.from("qs_description_library").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDescriptions((prev) => prev.filter((d) => d.id !== id));
    toast.success("Description deleted");
  }

  async function handleDescToggleActive(id: string, current: boolean) {
    const { error } = await supabase.from("qs_description_library").update({ is_active: !current }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDescriptions((prev) => prev.map((d) => (d.id === id ? { ...d, is_active: !current } : d)));
  }

  function updateNewDesc(elementId: string, field: string, value: string | boolean) {
    setNewDesc((prev) => ({
      ...prev,
      [elementId]: {
        ...(prev[elementId] ?? { description: "", in_price_list: false, material_rate: "", labor_rate: "" }),
        [field]: value,
      },
    }));
  }

  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Element Library</h1>
          <p className="text-sm text-muted-foreground">Standardized Discipline / Section / Sub Section / Sub Element / Description picklist, reused across all Tender BOQ line items</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {items.length} elements configured ({items.filter((i) => i.is_active).length} active)
        </p>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search section, sub-section, sub-element..."
            className="w-full rounded border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-hidden focus:border-primary"
          />
        </div>
      </div>

      {grouped.size === 0 && (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
          No elements match &ldquo;{search}&rdquo;.
        </div>
      )}

      {Array.from(grouped.entries()).map(([discipline, sectionMap]) => (
        <div key={discipline} className="space-y-2">
          <h3 className="px-1 text-sm font-semibold">{discipline}</h3>
          <div className="space-y-2">
            {Array.from(sectionMap.entries()).map(([section, rows]) => {
              const key = `${discipline}::${section}`;
              const expanded = isExpanded(key);
              return (
                <div key={key} className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    className="flex w-full items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-left hover:bg-muted/70"
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span className="text-sm font-medium">{section}</span>
                    <span className="text-xs text-muted-foreground">({rows.length})</span>
                  </button>
                  {expanded && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30">
                          <th className="w-[160px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Section
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Sub Section
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Sub Element
                          </th>
                          <th className="w-[70px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Unit
                          </th>
                          <th className="w-[200px] px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Budget Code
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Descriptions
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Active
                          </th>
                          <th className="w-20 px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const rowDescs = descriptions.filter((d) => d.element_library_id === r.id);
                          const descExpanded = expandedDescGroups.has(r.id);
                          return (
                            <Fragment key={r.id}>
                            <tr className="border-t border-border hover:bg-muted/30">
                            <td className="w-[160px] px-3 py-2">
                              <input
                                value={editMap[r.id]?.section ?? r.section}
                                onChange={(e) => updateField(r.id, "section", e.target.value)}
                                className={`${inputClass} text-xs truncate`}
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={editMap[r.id]?.sub_section ?? r.sub_section}
                                onChange={(e) => updateField(r.id, "sub_section", e.target.value)}
                                className={inputClass}
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={editMap[r.id]?.sub_element ?? r.sub_element}
                                onChange={(e) => updateField(r.id, "sub_element", e.target.value)}
                                className={inputClass}
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="w-[70px] px-3 py-2">
                              <input
                                value={editMap[r.id]?.typical_unit ?? r.typical_unit ?? ""}
                                onChange={(e) => updateField(r.id, "typical_unit", e.target.value)}
                                placeholder="e.g. m2"
                                className={`${inputClass} text-xs truncate`}
                                disabled={!canEdit}
                              />
                            </td>
                            <td className="w-[200px] px-3 py-2">
                              <select
                                value={editMap[r.id]?.budget_code_id ?? r.budget_code_id ?? ""}
                                onChange={(e) => updateField(r.id, "budget_code_id", e.target.value || null)}
                                className={`${inputClass} text-xs truncate`}
                                disabled={!canEdit}
                              >
                                <option value="">— none —</option>
                                {budgetCodes.map((bc) => (
                                  <option key={bc.id} value={bc.id}>
                                    {bc.code} — {bc.description}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-0.5">
                                {rowDescs.length === 0 && (
                                  <span className="text-xs text-muted-foreground italic">—</span>
                                )}
                                {rowDescs.slice(0, 3).map((d) => (
                                  <span key={d.id} className="flex items-center gap-1 text-xs leading-tight truncate" title={d.description}>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {d.material_rate != null && `$${d.material_rate}`}
                                      {d.material_rate != null && d.labor_rate != null && " / "}
                                      {d.labor_rate != null && `L$${d.labor_rate}`}
                                      {d.material_rate == null && d.labor_rate == null && "—"}
                                    </span>
                                    <span className="truncate">{d.description}</span>
                                  </span>
                                ))}
                                {rowDescs.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={() => toggleDescGroup(r.id)}
                                    className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                  >
                                    {descExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {rowDescs.length - 3} more...
                                  </button>
                                )}
                                {rowDescs.length <= 3 && rowDescs.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => toggleDescGroup(r.id)}
                                    className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                                  >
                                    {descExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {descExpanded ? "Less" : "Edit"}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(r.id, r.is_active)}
                                disabled={!canEdit}
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                  r.is_active
                                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                                    : "bg-red-50 text-red-700 hover:bg-red-100"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                              >
                                {r.is_active ? "Active" : "Inactive"}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                {canEdit && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleSave(r.id)}
                                    disabled={!editMap[r.id] || saving}
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {descExpanded && (
                            <tr>
                              <td colSpan={8} className="border-t border-border bg-muted/20 px-3 py-2">
                                <div className="ml-6 space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">Descriptions</p>
                                  {rowDescs.length === 0 && (
                                    <p className="text-xs text-muted-foreground italic">No descriptions yet. Add one below.</p>
                                  )}
                                  {rowDescs.map((d) => (
                                    <div key={d.id} className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs">
                                      <input
                                        value={descEditMap[d.id]?.description ?? d.description}
                                        onChange={(e) => updateDescField(d.id, "description", e.target.value)}
                                        className={`${inputClass} flex-1`}
                                        disabled={!canEdit}
                                      />
                                      <label className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                                        <input
                                          type="checkbox"
                                          checked={descEditMap[d.id]?.in_price_list ?? d.in_price_list}
                                          onChange={(e) => updateDescField(d.id, "in_price_list", e.target.checked)}
                                          disabled={!canEdit}
                                          className="h-3 w-3"
                                        />
                                        In Price List
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-amber-600 font-medium">M$</span>
                                        <input
                                          type="number"
                                          value={descEditMap[d.id]?.material_rate ?? d.material_rate ?? ""}
                                          onChange={(e) => updateDescField(d.id, "material_rate", e.target.value ? parseFloat(e.target.value) : null)}
                                          placeholder="0"
                                          className={`${inputClass} w-20`}
                                          disabled={!canEdit}
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-blue-600 font-medium">L$</span>
                                        <input
                                          type="number"
                                          value={descEditMap[d.id]?.labor_rate ?? d.labor_rate ?? ""}
                                          onChange={(e) => updateDescField(d.id, "labor_rate", e.target.value ? parseFloat(e.target.value) : null)}
                                          placeholder="0"
                                          className={`${inputClass} w-20`}
                                          disabled={!canEdit}
                                        />
                                      </div>
                                      {canEdit && (
                                        <Button size="sm" variant="ghost" onClick={() => handleDescSave(d.id)} disabled={!descEditMap[d.id] || saving}>
                                          <Save className="h-3 w-3" />
                                        </Button>
                                      )}
                                      {canDelete && (
                                        <Button size="sm" variant="ghost" onClick={() => handleDescDelete(d.id)}>
                                          <Trash2 className="h-3 w-3 text-destructive" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                  {canCreate && (
                                    <div className="flex items-center gap-2 rounded border border-dashed border-border px-2 py-1.5 text-xs">
                                      <input
                                        value={newDesc[r.id]?.description ?? ""}
                                        onChange={(e) => updateNewDesc(r.id, "description", e.target.value)}
                                        placeholder="New description..."
                                        className={`${inputClass} flex-1`}
                                      />
                                      <label className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                                        <input
                                          type="checkbox"
                                          checked={newDesc[r.id]?.in_price_list ?? false}
                                          onChange={(e) => updateNewDesc(r.id, "in_price_list", e.target.checked)}
                                          className="h-3 w-3"
                                        />
                                        In Price List
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-amber-600 font-medium">M$</span>
                                        <input
                                          type="number"
                                          value={newDesc[r.id]?.material_rate ?? ""}
                                          onChange={(e) => updateNewDesc(r.id, "material_rate", e.target.value)}
                                          placeholder="0"
                                          className={`${inputClass} w-20`}
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-blue-600 font-medium">L$</span>
                                        <input
                                          type="number"
                                          value={newDesc[r.id]?.labor_rate ?? ""}
                                          onChange={(e) => updateNewDesc(r.id, "labor_rate", e.target.value)}
                                          placeholder="0"
                                          className={`${inputClass} w-20`}
                                        />
                                      </div>
                                      <Button size="sm" variant="ghost" onClick={() => handleDescAdd(r.id)} disabled={saving}>
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {canCreate && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="mb-3 text-sm font-medium">Add New Element</h4>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Discipline</span>
              <input
                list="qs-discipline-options"
                value={newItem.discipline}
                onChange={(e) => setNewItem((prev) => ({ ...prev, discipline: e.target.value }))}
                placeholder="e.g. Architecture"
                className="w-40 rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              />
              <datalist id="qs-discipline-options">
                {disciplines.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">Section</span>
              <input
                value={newItem.section}
                onChange={(e) => setNewItem((prev) => ({ ...prev, section: e.target.value }))}
                placeholder="e.g. Wall Finishes"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">Sub Section</span>
              <input
                value={newItem.sub_section}
                onChange={(e) => setNewItem((prev) => ({ ...prev, sub_section: e.target.value }))}
                placeholder="e.g. Internal Wall Finishes"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">Sub Element</span>
              <input
                value={newItem.sub_element}
                onChange={(e) => setNewItem((prev) => ({ ...prev, sub_element: e.target.value }))}
                placeholder="e.g. Ceramic Tile Cladding"
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Unit</span>
              <input
                value={newItem.typical_unit}
                onChange={(e) => setNewItem((prev) => ({ ...prev, typical_unit: e.target.value }))}
                placeholder="m2"
                className="w-20 rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Budget Code</span>
              <select
                value={newItem.budget_code_id}
                onChange={(e) => setNewItem((prev) => ({ ...prev, budget_code_id: e.target.value }))}
                className="w-48 rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
              >
                <option value="">— none —</option>
                {budgetCodes.map((bc) => (
                  <option key={bc.id} value={bc.id}>
                    {bc.code} — {bc.description}
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
