"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Search, Trash2, Loader2 } from "lucide-react"
import { REASON_CODE_LABELS } from "./inv-types"
import type { InvStore, InvItem } from "./inv-types"

interface ProjectOption {
  id: string
  project_code: string
  project_name: string
}

interface LineItem {
  tempId: string
  item_id: string
  item_code: string
  item_name: string
  unit_of_measure: string
  quantity_before: string
  quantity_adjusted: string
  quantity_after: string
  unit_cost: string
}

export function AdjustmentCreatePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [stores, setStores] = useState<InvStore[]>([])
  const [items, setItems] = useState<InvItem[]>([])

  const [projectId, setProjectId] = useState("")
  const [storeId, setStoreId] = useState("")
  const [reasonCode, setReasonCode] = useState("")
  const [reasonDescription, setReasonDescription] = useState("")
  const [lines, setLines] = useState<LineItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Item search
  const [itemSearch, setItemSearch] = useState("")
  const [searchResults, setSearchResults] = useState<InvItem[]>([])
  const [searching, setSearching] = useState(false)

  // Load initial data
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from("projects").select("id, project_code, project_name").order("project_code"),
      supabase.from("inv_stores").select("*").eq("is_active", true).order("name"),
      supabase.from("inv_items").select("*").eq("is_active", true).order("name"),
    ]).then(([pRes, sRes, iRes]) => {
      if (pRes.data) setProjects(pRes.data as ProjectOption[])
      if (sRes.data) setStores(sRes.data as InvStore[])
      if (iRes.data) setItems(iRes.data as InvItem[])
    })
  }, [])

  // Item search debounce
  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const ql = q.toLowerCase()
    const results = items.filter(i =>
      i.item_code.toLowerCase().includes(ql) || i.name.toLowerCase().includes(ql),
    ).slice(0, 10)
    setSearchResults(results)
    setSearching(false)
  }, [items])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(itemSearch), 200)
    return () => clearTimeout(timer)
  }, [itemSearch, doSearch])

  function addLine(item: InvItem) {
    setLines(prev => [...prev, {
      tempId: crypto.randomUUID(),
      item_id: item.id,
      item_code: item.item_code,
      item_name: item.name,
      unit_of_measure: item.unit_of_measure,
      quantity_before: "0",
      quantity_adjusted: "0",
      quantity_after: "0",
      unit_cost: "0",
    }])
    setItemSearch("")
    setSearchResults([])
  }

  function updateLine(tempId: string, field: keyof LineItem, value: string) {
    setLines(prev => prev.map(l => {
      if (l.tempId !== tempId) return l
      const updated = { ...l, [field]: value }
      if (field === "quantity_before" || field === "quantity_adjusted") {
        const before = parseFloat(updated.quantity_before) || 0
        const adjusted = parseFloat(updated.quantity_adjusted) || 0
        updated.quantity_after = (before + adjusted).toFixed(4)
      }
      return updated
    }))
  }

  function removeLine(tempId: string) {
    setLines(prev => prev.filter(l => l.tempId !== tempId))
  }

  async function handleSubmit() {
    if (!projectId || !storeId || !reasonCode || !reasonDescription) {
      toast.error("Please fill in all required fields")
      return
    }
    if (lines.length === 0) {
      toast.error("Add at least one line item")
      return
    }

    const payload = {
      project_id: projectId,
      store_id: storeId,
      reason_code: reasonCode,
      reason_description: reasonDescription,
      lines: lines.map(l => ({
        item_id: l.item_id,
        quantity_before: parseFloat(l.quantity_before) || 0,
        quantity_adjusted: parseFloat(l.quantity_adjusted) || 0,
        quantity_after: parseFloat(l.quantity_after) || 0,
        unit_cost: parseFloat(l.unit_cost) || null,
      })),
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/inv/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create adjustment")
      toast.success(`Adjustment ${json.data.adjustment_number} created`)
      router.push(`/dashboard/inventory/adjustments/${json.data.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Adjustment</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record a stock quantity correction, damage, or write-off
          </p>
        </div>
      </div>

      {/* Basic info */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Project <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
            >
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Store <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              disabled={!projectId}
            >
              <option value="">Select store…</option>
              {stores.filter(s => !projectId || s.project_id === projectId).map(s =>
                <option key={s.id} value={s.id}>{s.name} ({s.store_code})</option>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason Code <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
            >
              <option value="">Select reason…</option>
              {Object.entries(REASON_CODE_LABELS).map(([key, label]) =>
                <option key={key} value={key}>{label}</option>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. 5 bags of cement damaged during handling"
              value={reasonDescription}
              onChange={e => setReasonDescription(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Item search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items by code or name…"
              className="pl-8"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
                {searching && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
                {searchResults.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    onClick={() => addLine(item)}
                  >
                    <span className="font-medium">{item.item_code}</span> — {item.name}
                    <span className="ml-2 text-xs text-muted-foreground">({item.unit_of_measure})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Search and select items above to add them to this adjustment.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty Before</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Adjustment (±)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty After</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map(l => (
                    <tr key={l.tempId}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{l.item_name}</p>
                        <p className="text-xs text-muted-foreground">{l.item_code} / {l.unit_of_measure}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          className="h-8 w-24 text-right ml-auto"
                          value={l.quantity_before}
                          onChange={e => updateLine(l.tempId, "quantity_before", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="any"
                          className="h-8 w-24 text-right ml-auto"
                          value={l.quantity_adjusted}
                          onChange={e => updateLine(l.tempId, "quantity_adjusted", e.target.value)}
                          placeholder="+ or -"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {parseFloat(l.quantity_after || "0").toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-8 w-24 text-right ml-auto"
                          value={l.unit_cost}
                          onChange={e => updateLine(l.tempId, "unit_cost", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button variant="ghost" size="icon" onClick={() => removeLine(l.tempId)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Adjustment
        </Button>
      </div>
    </div>
  )
}
