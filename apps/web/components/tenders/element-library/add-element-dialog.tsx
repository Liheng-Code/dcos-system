"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { type QsElementRow, type BudgetCodeOption, friendlyError } from "@/lib/qs/qs-element-library-shared";

interface AddElementDialogProps {
  disciplines: string[];
  budgetCodes: BudgetCodeOption[];
  currentMaxSortOrder: number;
  onClose: () => void;
  onCreated: (created: QsElementRow) => void;
}

export default function AddElementDialog({ disciplines, budgetCodes, currentMaxSortOrder, onClose, onCreated }: AddElementDialogProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState({
    discipline: "",
    section: "",
    sub_section: "",
    sub_element: "",
    typical_unit: "",
    budget_code_id: "",
  });

  async function handleAdd() {
    if (!newItem.discipline.trim() || !newItem.section.trim() || !newItem.sub_section.trim() || !newItem.sub_element.trim()) {
      toast.error("Discipline, section, sub-section and sub-element are required");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("qs_element_library")
      .insert({
        discipline: newItem.discipline.trim(),
        section: newItem.section.trim(),
        sub_section: newItem.sub_section.trim(),
        sub_element: newItem.sub_element.trim(),
        typical_unit: newItem.typical_unit.trim() || null,
        budget_code_id: newItem.budget_code_id || null,
        sort_order: currentMaxSortOrder + 1,
      })
      .select()
      .single();
    if (error) {
      toast.error(friendlyError(error));
    } else if (data) {
      onCreated(data as QsElementRow);
      toast.success("Element added");
      onClose();
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h4 className="mb-3 text-sm font-medium">Add New Element</h4>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Discipline</span>
            <input
              list="qs-new-discipline-options"
              value={newItem.discipline}
              onChange={(e) => setNewItem((prev) => ({ ...prev, discipline: e.target.value }))}
              placeholder="e.g. Architecture"
              className="w-40 rounded border border-border bg-background px-2 py-1.5 text-sm outline-hidden focus:border-primary"
            />
            <datalist id="qs-new-discipline-options">
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
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
