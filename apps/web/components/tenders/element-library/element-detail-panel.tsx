"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  type QsElementRow,
  type DescriptionRow,
  type BudgetCodeOption,
  friendlyError,
  friendlyDescError,
  inputClass,
} from "@/lib/qs-element-library-shared";

interface ElementDetailPanelProps {
  item: QsElementRow;
  descriptions: DescriptionRow[];
  disciplines: string[];
  budgetCodes: BudgetCodeOption[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: (updated: QsElementRow) => void;
  onDeleted: (id: string) => void;
  onDescriptionsChange: (updater: (prev: DescriptionRow[]) => DescriptionRow[]) => void;
}

interface ElementForm {
  discipline: string;
  section: string;
  sub_section: string;
  sub_element: string;
  typical_unit: string;
  budget_code_id: string;
}

function seedForm(item: QsElementRow): ElementForm {
  return {
    discipline: item.discipline,
    section: item.section,
    sub_section: item.sub_section,
    sub_element: item.sub_element,
    typical_unit: item.typical_unit ?? "",
    budget_code_id: item.budget_code_id ?? "",
  };
}

export default function ElementDetailPanel({
  item,
  descriptions,
  disciplines,
  budgetCodes,
  canCreate,
  canEdit,
  canDelete,
  onClose,
  onSaved,
  onDeleted,
  onDescriptionsChange,
}: ElementDetailPanelProps) {
  const supabase = createClient();
  const [form, setForm] = useState<ElementForm>(() => seedForm(item));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [descEditMap, setDescEditMap] = useState<Record<string, Partial<DescriptionRow>>>({});
  const [newDesc, setNewDesc] = useState({ description: "", in_price_list: false, material_rate: "", labor_rate: "" });

  useEffect(() => {
    setForm(seedForm(item));
    setDescEditMap({});
    setNewDesc({ description: "", in_price_list: false, material_rate: "", labor_rate: "" });
  }, [item]);

  const elementDescriptions = useMemo(
    () => descriptions.filter((d) => d.element_library_id === item.id),
    [descriptions, item.id]
  );

  const dirty =
    form.discipline !== item.discipline ||
    form.section !== item.section ||
    form.sub_section !== item.sub_section ||
    form.sub_element !== item.sub_element ||
    form.typical_unit !== (item.typical_unit ?? "") ||
    form.budget_code_id !== (item.budget_code_id ?? "");

  function updateForm<K extends keyof ElementForm>(field: K, value: ElementForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // ── Element CRUD ─────────────────────────────────────────────────────────────

  async function handleSaveElement() {
    setSaving(true);
    const payload: Partial<QsElementRow> = {
      discipline: form.discipline.trim(),
      section: form.section.trim(),
      sub_section: form.sub_section.trim(),
      sub_element: form.sub_element.trim(),
      typical_unit: form.typical_unit.trim() !== "" ? form.typical_unit.trim() : null,
      budget_code_id: form.budget_code_id || null,
    };
    const { error } = await supabase.from("qs_element_library").update(payload).eq("id", item.id);
    if (error) {
      toast.error(friendlyError(error));
    } else {
      onSaved({ ...item, ...payload });
      toast.success("Element updated");
    }
    setSaving(false);
  }

  async function handleToggleActive() {
    const { error } = await supabase.from("qs_element_library").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved({ ...item, is_active: !item.is_active });
  }

  async function handleDeleteItem() {
    if (!confirm("Delete this element? BOQ line items that already reference it will keep their frozen values.")) return;
    setDeleting(true);
    const { error } = await supabase.from("qs_element_library").delete().eq("id", item.id);
    if (error) {
      toast.error(error.message);
      setDeleting(false);
      return;
    }
    toast.success("Element deleted");
    onDeleted(item.id);
  }

  // ── Description CRUD ─────────────────────────────────────────────────────────

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
      toast.error(friendlyDescError(error));
    } else {
      onDescriptionsChange((prev) => prev.map((d) => (d.id === id ? { ...d, ...payload } : d)));
      setDescEditMap((prev) => {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      });
      toast.success("Description updated");
    }
    setSaving(false);
  }

  async function handleDescAdd() {
    if (!newDesc.description.trim()) {
      toast.error("Description is required");
      return;
    }
    setSaving(true);
    const maxOrder = elementDescriptions.reduce((m, d) => Math.max(m, d.sort_order), 0);
    const { data, error } = await supabase
      .from("qs_description_library")
      .insert({
        element_library_id: item.id,
        description: newDesc.description.trim(),
        in_price_list: newDesc.in_price_list,
        material_rate: newDesc.material_rate ? parseFloat(newDesc.material_rate) : null,
        labor_rate: newDesc.labor_rate ? parseFloat(newDesc.labor_rate) : null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();
    if (error) {
      toast.error(friendlyDescError(error));
    } else if (data) {
      onDescriptionsChange((prev) => [...prev, data as DescriptionRow]);
      setNewDesc({ description: "", in_price_list: false, material_rate: "", labor_rate: "" });
      toast.success("Description added");
    }
    setSaving(false);
  }

  async function handleDescDelete(id: string) {
    if (!confirm("Delete this description?")) return;
    const { error } = await supabase.from("qs_description_library").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDescriptionsChange((prev) => prev.filter((d) => d.id !== id));
    toast.success("Description deleted");
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{item.discipline}</span>
              <span className="text-xs text-muted-foreground">/</span>
              <span className="text-xs text-muted-foreground">{item.section}</span>
            </div>
            <h3 className="text-sm font-semibold mt-1">{item.sub_element}</h3>
          </div>
          <div className="flex items-center gap-2">
            {canDelete && (
              <button
                onClick={handleDeleteItem}
                disabled={deleting}
                className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                title="Delete this element"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Element fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Discipline</label>
            <input
              list="qs-discipline-options"
              value={form.discipline}
              onChange={(e) => updateForm("discipline", e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
            <datalist id="qs-discipline-options">
              {disciplines.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Section</label>
            <input
              value={form.section}
              onChange={(e) => updateForm("section", e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Sub Section</label>
            <input
              value={form.sub_section}
              onChange={(e) => updateForm("sub_section", e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Sub Element</label>
            <input
              value={form.sub_element}
              onChange={(e) => updateForm("sub_element", e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Unit</label>
            <input
              value={form.typical_unit}
              onChange={(e) => updateForm("typical_unit", e.target.value)}
              placeholder="e.g. m2"
              disabled={!canEdit}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Budget Code</label>
            <select
              value={form.budget_code_id}
              onChange={(e) => updateForm("budget_code_id", e.target.value)}
              disabled={!canEdit}
              className={inputClass}
            >
              <option value="">— none —</option>
              {budgetCodes.map((bc) => (
                <option key={bc.id} value={bc.id}>
                  {bc.code} — {bc.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={!canEdit}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              item.is_active ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-red-50 text-red-700 hover:bg-red-100"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {item.is_active ? "Active" : "Inactive"}
          </button>
          {canEdit && (
            <Button size="sm" onClick={handleSaveElement} disabled={!dirty || saving}>
              <Save className="mr-1 h-3.5 w-3.5" /> Save
            </Button>
          )}
        </div>

        {/* Descriptions */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Descriptions ({elementDescriptions.length})</p>
          {elementDescriptions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No descriptions yet. Add one below.</p>
          )}
          {elementDescriptions.map((d) => (
            <div key={d.id} className="space-y-1.5 rounded border border-border bg-background px-2 py-1.5 text-xs">
              <input
                value={descEditMap[d.id]?.description ?? d.description}
                onChange={(e) => updateDescField(d.id, "description", e.target.value)}
                className={`${inputClass} w-full`}
                disabled={!canEdit}
              />
              <div className="flex items-center gap-2">
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
                <div className="ml-auto flex items-center gap-1">
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
              </div>
            </div>
          ))}
          {canCreate && (
            <div className="space-y-1.5 rounded border border-dashed border-border px-2 py-1.5 text-xs">
              <input
                value={newDesc.description}
                onChange={(e) => setNewDesc((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="New description..."
                className={`${inputClass} w-full`}
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={newDesc.in_price_list}
                    onChange={(e) => setNewDesc((prev) => ({ ...prev, in_price_list: e.target.checked }))}
                    className="h-3 w-3"
                  />
                  In Price List
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-amber-600 font-medium">M$</span>
                  <input
                    type="number"
                    value={newDesc.material_rate}
                    onChange={(e) => setNewDesc((prev) => ({ ...prev, material_rate: e.target.value }))}
                    placeholder="0"
                    className={`${inputClass} w-20`}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-blue-600 font-medium">L$</span>
                  <input
                    type="number"
                    value={newDesc.labor_rate}
                    onChange={(e) => setNewDesc((prev) => ({ ...prev, labor_rate: e.target.value }))}
                    placeholder="0"
                    className={`${inputClass} w-20`}
                  />
                </div>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={handleDescAdd} disabled={saving}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
