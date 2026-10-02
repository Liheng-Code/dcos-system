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
import { LOCATION_TYPE_LABELS } from "./inv-types"
import type { LocationRow } from "./inv-types"

interface LocationFormProps {
  storeId: string
  location: LocationRow | null
  locations: LocationRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function LocationForm({ storeId, location, locations, open, onOpenChange, onSaved }: LocationFormProps) {
  const [form, setForm] = useState({
    code: location?.code ?? "",
    location_type: location?.location_type ?? "zone",
    parent_id: location?.parent_id ?? "",
    is_dg_allowed: location?.is_dg_allowed ?? false,
    capacity_qty: location?.capacity_qty != null ? String(location.capacity_qty) : "",
    status: location?.status ?? "active",
  })
  const [saving, setSaving] = useState(false)

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.code.trim()) {
      toast.error("Location code is required")
      return
    }

    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      location_type: form.location_type,
      parent_id: form.parent_id || null,
      is_dg_allowed: form.is_dg_allowed,
      capacity_qty: form.capacity_qty !== "" ? parseFloat(form.capacity_qty) : null,
    }
    if (!location) payload.store_id = storeId
    if (location) payload.status = form.status

    setSaving(true)
    try {
      const res = await fetch(location ? `/api/inv/locations/${location.id}` : "/api/inv/locations", {
        method: location ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save location")
      toast.success(location ? "Location updated" : "Location created")
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const parentCandidates = locations.filter(l => l.id !== location?.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{location ? "Edit Location" : "New Location"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Code <span className="text-destructive">*</span></Label>
            <Input value={form.code} onChange={e => update("code", e.target.value)} placeholder="e.g. A / A-01 / A-01-R1 / A-01-R1-B01" />
          </div>

          <div className="space-y-1.5">
            <Label>Location Type <span className="text-destructive">*</span></Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.location_type}
              onChange={e => update("location_type", e.target.value as typeof form.location_type)}
            >
              {Object.entries(LOCATION_TYPE_LABELS).map(([key, l]) => <option key={key} value={key}>{l}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Parent Location</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={form.parent_id}
              onChange={e => update("parent_id", e.target.value)}
            >
              <option value="">No parent (top level)</option>
              {parentCandidates.map(l => (
                <option key={l.id} value={l.id}>{LOCATION_TYPE_LABELS[l.location_type]} — {l.code}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Capacity Qty</Label>
            <Input type="number" min="0" step="any" value={form.capacity_qty} onChange={e => update("capacity_qty", e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.is_dg_allowed}
              onChange={e => update("is_dg_allowed", e.target.checked)}
            />
            Dangerous Goods (DG) storage allowed
          </label>

          {location && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.status}
                onChange={e => update("status", e.target.value as typeof form.status)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {location ? "Update Location" : "Create Location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
