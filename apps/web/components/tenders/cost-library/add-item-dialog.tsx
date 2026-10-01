"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  type PrelimLibraryItem,
  type PrelimLibraryItemWithComponents,
  createLibraryItem,
} from "@/lib/qs/prelim-library-service";
import { toast } from "sonner";

interface AddItemDialogProps {
  items: PrelimLibraryItemWithComponents[];
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORY_OPTIONS: { value: PrelimLibraryItem["category"]; label: string }[] = [
  { value: "early_work", label: "Early Works" },
  { value: "temporary_works", label: "Temporary Works" },
  { value: "staff", label: "Site Staff & Overheads" },
  { value: "design", label: "Design Expenses" },
  { value: "risk", label: "Risks & Opportunities" },
];

// Suggests the next sibling code under a parent, e.g. parent "Z.01.05" with
// existing children "Z.01.05.01" / "Z.01.05.02" -> "Z.01.05.03".
function suggestNextCode(items: PrelimLibraryItemWithComponents[], parentCode: string | null): string {
  if (!parentCode) return "";
  const siblings = items.filter((i) => i.parent_code === parentCode);
  let maxSuffix = 0;
  for (const s of siblings) {
    const rest = s.code.slice(parentCode.length).replace(/^\./, "");
    const n = parseInt(rest, 10);
    if (!Number.isNaN(n) && n > maxSuffix) maxSuffix = n;
  }
  return `${parentCode}.${String(maxSuffix + 1).padStart(2, "0")}`;
}

export default function AddItemDialog({ items, onClose, onCreated }: AddItemDialogProps) {
  const [category, setCategory] = useState<PrelimLibraryItem["category"]>("temporary_works");
  const [parentCode, setParentCode] = useState<string>("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("Item");
  const [calcMode, setCalcMode] = useState<PrelimLibraryItem["calc_mode"]>("fixed");
  const [defaultQty, setDefaultQty] = useState(1);
  const [formula, setFormula] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const parentOptions = useMemo(
    () => items.filter((i) => i.category === category).sort((a, b) => a.code.localeCompare(b.code)),
    [items, category],
  );

  function handleCategoryChange(next: PrelimLibraryItem["category"]) {
    setCategory(next);
    setParentCode("");
    if (!codeTouched) setCode("");
  }

  function handleParentChange(next: string) {
    setParentCode(next);
    if (!codeTouched) setCode(suggestNextCode(items, next || null));
  }

  const codeExists = code.trim() !== "" && items.some((i) => i.code === code.trim());
  const canSave = code.trim() !== "" && description.trim() !== "" && !codeExists && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const siblingCount = items.filter((i) => i.parent_code === (parentCode || null)).length;
      await createLibraryItem({
        parent_code: parentCode || null,
        code: code.trim(),
        description: description.trim(),
        unit: unit.trim() || "Item",
        calc_mode: calcMode,
        default_qty: calcMode === "sum_children" ? 0 : defaultQty,
        formula: calcMode === "param" ? formula.trim() || null : null,
        sort_order: siblingCount,
        category,
        notes: notes.trim() || null,
      });
      toast.success("Library item created");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create library item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add Library Item</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Section</label>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as PrelimLibraryItem["category"])}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Parent (nest under)</label>
            <select
              value={parentCode}
              onChange={(e) => handleParentChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="">— Top-level section —</option>
              {parentOptions.map((opt) => (
                <option key={opt.id} value={opt.code}>{opt.code} — {opt.description}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Code</label>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setCodeTouched(true); }}
              placeholder="e.g. Z.01.05.03"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-mono"
            />
            {codeExists && <p className="text-xs text-red-600">Code already exists</p>}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Unit</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Item / Month / m2 / Floor / Lot / Sum"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Item description"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Calc Mode</label>
            <select
              value={calcMode}
              onChange={(e) => setCalcMode(e.target.value as PrelimLibraryItem["calc_mode"])}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            >
              <option value="fixed">Fixed qty</option>
              <option value="param">Parameter formula</option>
              <option value="sum_children">Sum of children</option>
            </select>
          </div>
          {calcMode !== "sum_children" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Default Qty</label>
              <input
                type="number"
                value={defaultQty}
                onChange={(e) => setDefaultQty(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
              />
            </div>
          )}
          {calcMode === "param" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Formula</label>
              <input
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="e.g. P06"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-mono"
              />
            </div>
          )}
        </div>

        {calcMode === "sum_children" && (
          <p className="text-xs text-muted-foreground">
            This item&apos;s amount is the sum of the items nested under it — no quantity or rate needed here.
          </p>
        )}
        {calcMode !== "sum_children" && (
          <p className="text-xs text-muted-foreground">
            Rate components (labour, materials, etc.) are added afterward from the item editor, once this item is created.
          </p>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            Create Item
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
