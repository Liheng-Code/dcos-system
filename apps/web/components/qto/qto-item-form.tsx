"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  QTO_CONFIDENCE,
  QTO_SOURCE_TYPES,
  createQtoItem,
  updateQtoItem,
  type QtoConfidence,
  type QtoItem,
  type QtoSourceType,
} from "@/lib/qto-service";

export const QTO_BUILDINGS = ["BA", "BB", "BX", "GENERAL"] as const;
export const QTO_DISCIPLINES = ["STR", "ARC", "CIV", "MEP", "ELE", "OTH"] as const;

interface QtoItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenderId: string;
  editItem?: QtoItem | null;
  onSaved?: () => void;
}

const EMPTY = {
  building: "",
  discipline: "",
  work_section: "",
  element: "",
  item_code: "",
  description: "",
  unit: "m",
  measurement_method: "measure",
  source_type: "D1" as QtoSourceType,
  confidence: "MEDIUM" as QtoConfidence,
};

export function QtoItemForm({ open, onOpenChange, tenderId, editItem, onSaved }: QtoItemFormProps) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(
      editItem
        ? {
            building: editItem.building ?? "",
            discipline: editItem.discipline ?? "",
            work_section: editItem.work_section ?? "",
            element: editItem.element ?? "",
            item_code: editItem.item_code ?? "",
            description: editItem.description,
            unit: editItem.unit,
            measurement_method: editItem.measurement_method,
            source_type: editItem.source_type,
            confidence: editItem.confidence,
          }
        : EMPTY
    );
  }, [open, editItem]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    setSaving(true);
    const payload = {
      tender_id: tenderId,
      building: form.building || null,
      discipline: form.discipline || null,
      work_section: form.work_section || null,
      element: form.element || null,
      item_code: form.item_code || null,
      description: form.description.trim(),
      unit: form.unit,
      measurement_method: form.measurement_method,
      source_type: form.source_type,
      confidence: form.confidence,
    };
    const result = editItem ? await updateQtoItem(editItem.id, payload) : await createQtoItem(payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(editItem ? "QTO item updated" : "QTO item created");
    onOpenChange(false);
    onSaved?.();
  }

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editItem ? `Edit ${editItem.qto_no}` : "New QTO Item"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelCls}>Building</label>
            <select className={inputCls} value={form.building} onChange={(e) => set("building", e.target.value)}>
              <option value="">—</option>
              {QTO_BUILDINGS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Discipline</label>
            <select className={inputCls} value={form.discipline} onChange={(e) => set("discipline", e.target.value)}>
              <option value="">—</option>
              {QTO_DISCIPLINES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Work Section</label>
            <input className={inputCls} value={form.work_section} onChange={(e) => set("work_section", e.target.value)} placeholder="e.g. Concrete Works" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Element</label>
            <input className={inputCls} value={form.element} onChange={(e) => set("element", e.target.value)} placeholder="e.g. Pile Cap" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Item Code</label>
            <input className={inputCls} value={form.item_code} onChange={(e) => set("item_code", e.target.value)} placeholder="e.g. PC-01" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Unit</label>
            <input className={inputCls} value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="m, m2, m3, kg, No." />
          </div>
          <div className="col-span-2 space-y-1">
            <label className={labelCls}>Description *</label>
            <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Work item description" />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Measurement Method</label>
            <select className={inputCls} value={form.measurement_method} onChange={(e) => set("measurement_method", e.target.value)}>
              <option value="measure">Measure from drawing</option>
              <option value="formula">Formula / dimension</option>
              <option value="count">Count</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Source Type</label>
            <select className={inputCls} value={form.source_type} onChange={(e) => set("source_type", e.target.value as QtoSourceType)}>
              {QTO_SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Confidence</label>
            <select className={inputCls} value={form.confidence} onChange={(e) => set("confidence", e.target.value as QtoConfidence)}>
              {QTO_CONFIDENCE.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {editItem ? "Save Changes" : "Create Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
