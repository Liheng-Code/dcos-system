"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Save } from "lucide-react"
import { CATEGORIES } from "./inv-types"
import type { InvItem } from "./inv-types"

interface ItemFormProps {
  item: InvItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function ItemForm({ item, open, onOpenChange, onSaved }: ItemFormProps) {
  const [form, setForm] = useState({
    item_code: item?.item_code ?? "",
    name: item?.name ?? "",
    category: item?.category ?? "structural",
    sub_category: item?.sub_category ?? "",
    unit_of_measure: item?.unit_of_measure ?? "",
    default_cost_code: item?.default_cost_code ?? "",
    min_stock_level: item?.min_stock_level != null ? String(item.min_stock_level) : "",
    max_stock_level: item?.max_stock_level != null ? String(item.max_stock_level) : "",
    reorder_quantity: item?.reorder_quantity != null ? String(item.reorder_quantity) : "",
    lead_time_days: item?.lead_time_days != null ? String(item.lead_time_days) : "",
    barcode: item?.barcode ?? "",
    shelf_life_days: item?.shelf_life_days != null ? String(item.shelf_life_days) : "",
    is_inspection_required: item?.is_inspection_required ?? false,
    is_dg: item?.is_dg ?? false,
    is_batch_managed: item?.is_batch_managed ?? false,
    is_active: item?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.item_code.trim() || !form.name.trim() || !form.unit_of_measure.trim()) {
      toast.error("Item code, name and unit of measure are required")
      return
    }

    const payload: Record<string, unknown> = {
      item_code: form.item_code.trim(),
      name: form.name.trim(),
      category: form.category,
      sub_category: form.sub_category.trim() || null,
      unit_of_measure: form.unit_of_measure.trim(),
      default_cost_code: form.default_cost_code.trim() || null,
      min_stock_level: form.min_stock_level !== "" ? parseFloat(form.min_stock_level) : null,
      max_stock_level: form.max_stock_level !== "" ? parseFloat(form.max_stock_level) : null,
      reorder_quantity: form.reorder_quantity !== "" ? parseFloat(form.reorder_quantity) : null,
      lead_time_days: form.lead_time_days !== "" ? parseInt(form.lead_time_days, 10) : null,
      is_inspection_required: form.is_inspection_required,
      barcode: form.barcode.trim() || null,
      is_dg: form.is_dg,
      is_batch_managed: form.is_batch_managed,
      shelf_life_days: form.shelf_life_days !== "" ? parseInt(form.shelf_life_days, 10) : null,
    }
    if (item) payload.is_active = form.is_active

    setSaving(true)
    try {
      const res = await fetch(item ? `/api/inv/items/${item.id}` : "/api/inv/items", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save item")
      toast.success(item ? "Item updated" : "Item created")
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Item" : "New Item"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Item Code <span className="text-destructive">*</span></Label>
              <Input value={form.item_code} onChange={e => update("item_code", e.target.value)} placeholder="e.g. STL-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="Item name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category <span className="text-destructive">*</span></Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.category}
                onChange={e => update("category", e.target.value)}
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Sub-category</Label>
              <Input value={form.sub_category} onChange={e => update("sub_category", e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Unit of Measure <span className="text-destructive">*</span></Label>
              <Input value={form.unit_of_measure} onChange={e => update("unit_of_measure", e.target.value)} placeholder="e.g. kg, nos, m3" />
            </div>
            <div className="space-y-1.5">
              <Label>Default Cost Code</Label>
              <Input value={form.default_cost_code} onChange={e => update("default_cost_code", e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Min Stock Level</Label>
              <Input type="number" min="0" step="any" value={form.min_stock_level} onChange={e => update("min_stock_level", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Max Stock Level</Label>
              <Input type="number" min="0" step="any" value={form.max_stock_level} onChange={e => update("max_stock_level", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Quantity</Label>
              <Input type="number" min="0" step="any" value={form.reorder_quantity} onChange={e => update("reorder_quantity", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Lead Time (days)</Label>
              <Input type="number" min="0" step="1" value={form.lead_time_days} onChange={e => update("lead_time_days", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Shelf Life (days)</Label>
              <Input type="number" min="0" step="1" value={form.shelf_life_days} onChange={e => update("shelf_life_days", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={e => update("barcode", e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.is_inspection_required}
                onChange={e => update("is_inspection_required", e.target.checked)}
              />
              Inspection Required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.is_dg}
                onChange={e => update("is_dg", e.target.checked)}
              />
              Dangerous Goods (DG)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.is_batch_managed}
                onChange={e => update("is_batch_managed", e.target.checked)}
              />
              Batch Managed
            </label>
            {item && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.is_active}
                  onChange={e => update("is_active", e.target.checked)}
                />
                Active
              </label>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {item ? "Update Item" : "Create Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
