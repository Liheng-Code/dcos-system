"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Section {
  id: string;
  seq: number;
  section_code: string | null;
  title: string;
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any;
  sections: Section[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSaved: (item: any) => void;
  onCancel: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BoqItemEditor({ item: rawItem, sections, onSaved, onCancel }: { item: any; sections: Section[]; onSaved: (item: any) => void; onCancel: () => void }) {
  const item = rawItem ?? {};
  const isNew = !item.id;
  const [sectionId, setSectionId] = useState((item.boq_section_id as string) ?? (sections[0]?.id ?? ""));
  const [itemNo, setItemNo] = useState((item.item_no as string) ?? "");
  const [itemCode, setItemCode] = useState((item.item_code as string) ?? "");
  const [description, setDescription] = useState((item.description as string) ?? "");
  const [unit, setUnit] = useState((item.unit as string) ?? "each");
  const [quantity, setQuantity] = useState((item.quantity as number) ?? 0);
  const [unitRate, setUnitRate] = useState((item.unit_rate as number) ?? 0);
  const [notes, setNotes] = useState((item.notes as string) ?? "");
  const [saving, setSaving] = useState(false);

  const total = quantity * unitRate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      project_id: (item.project_id as string),
      boq_section_id: sectionId || null,
      item_no: itemNo.trim() || null,
      item_code: itemCode.trim() || null,
      description: description.trim(),
      unit,
      quantity,
      unit_rate: unitRate,
      notes: notes.trim() || null,
    };

    if (isNew) {
      const { data, error } = await supabase.from("qs_boq_items").insert([payload]).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Item created");
      onSaved(data);
    } else {
      const { data, error } = await supabase.from("qs_boq_items").update(payload).eq("id", item.id).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Item updated");
      onSaved(data);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h2 className="text-lg font-semibold">{isNew ? "New BOQ Item" : "Edit BOQ Item"}</h2>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Section</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={sectionId}
                  onChange={e => setSectionId(e.target.value)}
                >
                  <option value="">No section</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.section_code ?? s.seq} — {s.title}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Item No</Label>
                <Input value={itemNo} onChange={e => setItemNo(e.target.value)} placeholder="e.g. A.1" />
              </div>
              <div className="space-y-1.5">
                <Label>Item Code</Label>
                <Input value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="e.g. CONC-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                >
                  {["each", "m3", "m2", "m", "kg", "ton", "litre", "hour", "day", "week", "month", "lump_sum"].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Item description" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" step="0.01" min="0" value={quantity} onChange={e => setQuantity(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit Rate ($)</Label>
                <Input type="number" step="0.01" min="0" value={unitRate} onChange={e => setUnitRate(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Total ($)</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm font-semibold">
                  ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isNew ? "Create Item" : "Update Item"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
