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
import type { ToolRow } from "./inv-types"

interface ToolFormProps {
  tool: ToolRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function ToolForm({ tool, open, onOpenChange, onSaved }: ToolFormProps) {
  const [form, setForm] = useState({
    tool_code: tool?.tool_code ?? "",
    name: tool?.name ?? "",
    serial_no: tool?.serial_no ?? "",
    category: tool?.category ?? "",
    purchase_value: tool?.purchase_value != null ? String(tool.purchase_value) : "",
    is_restricted: tool?.is_restricted ?? false,
    status: tool?.status ?? "available",
  })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.tool_code.trim() || !form.name.trim()) {
      toast.error("Tool code and name are required")
      return
    }

    const payload: Record<string, unknown> = {
      tool_code: form.tool_code.trim(),
      name: form.name.trim(),
      serial_no: form.serial_no.trim() || null,
      category: form.category.trim() || null,
      // API expects a decimal string (e.g. "150.00"), not a native float — see inv-schemas.ts decimalMoneyString.
      purchase_value: form.purchase_value !== "" ? parseFloat(form.purchase_value).toFixed(2) : null,
      is_restricted: form.is_restricted,
    }
    if (tool) payload.status = form.status

    setSaving(true)
    try {
      const res = await fetch(tool ? `/api/inv/tools/${tool.id}` : "/api/inv/tools", {
        method: tool ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save tool")
      toast.success(tool ? "Tool updated" : "Tool created")
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tool ? "Edit Tool" : "New Tool"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tool Code <span className="text-destructive">*</span></Label>
              <Input value={form.tool_code} onChange={e => update("tool_code", e.target.value)} placeholder="e.g. TL-0042" />
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. Angle Grinder" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Serial No.</Label>
              <Input value={form.serial_no} onChange={e => update("serial_no", e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => update("category", e.target.value)} placeholder="e.g. Power Tool, Survey Equipment" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Purchase Value</Label>
              <Input type="number" min="0" step="0.01" value={form.purchase_value} onChange={e => update("purchase_value", e.target.value)} />
            </div>
            {tool && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.status}
                  onChange={e => update("status", e.target.value as typeof form.status)}
                >
                  <option value="available">Available</option>
                  <option value="issued">Issued</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="lost">Lost</option>
                  <option value="disposed">Disposed</option>
                </select>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.is_restricted}
              onChange={e => update("is_restricted", e.target.checked)}
            />
            Restricted — issuing requires approval permission
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {tool ? "Update Tool" : "Create Tool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
