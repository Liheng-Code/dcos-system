"use client"

import { useEffect, useState } from "react"
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
import { STORE_TYPE_LABELS } from "./inv-types"
import type { InvStore } from "./inv-types"
import { listProfiles, listProjects } from "@/lib/inventory/inventory-queries";

interface ProjectOption {
  id: string
  project_code: string
  project_name: string
}

interface UserOption {
  id: string
  full_name: string | null
  email: string
}

interface StoreFormProps {
  store: InvStore | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function StoreForm({ store, open, onOpenChange, onSaved }: StoreFormProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])

  const [form, setForm] = useState({
    project_id: store?.project_id ?? "",
    store_code: store?.store_code ?? "",
    name: store?.name ?? "",
    store_type: store?.store_type ?? "site",
    location_description: store?.location_description ?? "",
    responsible_user_id: store?.responsible_user_id ?? "",
    capacity_qty: store?.capacity_qty != null ? String(store.capacity_qty) : "",
    capacity_uom: store?.capacity_uom ?? "",
    status: store?.status ?? "active",
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      listProjects(),
      listProfiles(),
    ]).then(([pRes, uRes]) => {
      if (pRes.data) setProjects(pRes.data as ProjectOption[])
      if (uRes.data) setUsers(uRes.data as UserOption[])
    })
  }, [])

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.project_id || !form.store_code.trim() || !form.name.trim()) {
      toast.error("Project, store code and name are required")
      return
    }

    const payload: Record<string, unknown> = {
      store_code: form.store_code.trim(),
      name: form.name.trim(),
      store_type: form.store_type,
      location_description: form.location_description.trim() || null,
      responsible_user_id: form.responsible_user_id || null,
      capacity_qty: form.capacity_qty !== "" ? parseFloat(form.capacity_qty) : null,
      capacity_uom: form.capacity_uom.trim() || null,
    }
    if (!store) payload.project_id = form.project_id
    if (store) payload.status = form.status

    setSaving(true)
    try {
      const res = await fetch(store ? `/api/inv/stores/${store.id}` : "/api/inv/stores", {
        method: store ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save store")
      toast.success(store ? "Store updated" : "Store created")
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
          <DialogTitle>{store ? "Edit Store" : "New Store"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project <span className="text-destructive">*</span></Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm disabled:opacity-60"
              value={form.project_id}
              onChange={e => update("project_id", e.target.value)}
              disabled={!!store}
            >
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
            </select>
            {store && <p className="text-xs text-muted-foreground">Project cannot be changed after a store is created.</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Store Code <span className="text-destructive">*</span></Label>
              <Input value={form.store_code} onChange={e => update("store_code", e.target.value)} placeholder="e.g. STR-MAIN" />
            </div>
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => update("name", e.target.value)} placeholder="Store name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Store Type <span className="text-destructive">*</span></Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.store_type}
                onChange={e => update("store_type", e.target.value as typeof form.store_type)}
              >
                {Object.entries(STORE_TYPE_LABELS).map(([key, l]) => <option key={key} value={key}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsible User</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.responsible_user_id}
                onChange={e => update("responsible_user_id", e.target.value)}
              >
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Location Description</Label>
            <Input
              value={form.location_description}
              onChange={e => update("location_description", e.target.value)}
              placeholder="e.g. North yard, adjacent to Gate 2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Capacity Qty</Label>
              <Input type="number" min="0" step="any" value={form.capacity_qty} onChange={e => update("capacity_qty", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Capacity UoM</Label>
              <Input value={form.capacity_uom} onChange={e => update("capacity_uom", e.target.value)} placeholder="e.g. m3, pallets" />
            </div>
          </div>

          {store && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.status}
                onChange={e => update("status", e.target.value as typeof form.status)}
              >
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {store ? "Update Store" : "Create Store"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
