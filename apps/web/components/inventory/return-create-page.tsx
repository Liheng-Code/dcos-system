"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Search, Trash2, Loader2, Undo2 } from "lucide-react"
import { RETURN_CONDITION_LABELS } from "./inv-types"
import type { InvStore, InvItem } from "./inv-types"
import { listInvItemsByFilterWithIsActive, listInvMaterialRequisitionsByProjectIdAndStoreIdWithStatusIssuedPartiallyIssued, listInvStoresWithStatusActive } from "@/lib/inventory/inventory-queries";

interface MrOption {
  id: string
  mr_number: string
  status: string
}

interface LineItem {
  tempId: string
  item_id: string
  item_code: string
  item_name: string
  unit_of_measure: string
  quantity: string
  condition: "good" | "damaged" | "scrap"
  unit_cost: string
  remarks: string
}

export function ReturnCreatePage() {
  const router = useRouter()

  const [stores, setStores] = useState<InvStore[]>([])
  const [mrs, setMrs] = useState<MrOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [storeId, setStoreId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [mrId, setMrId] = useState("")
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10))

  const [lines, setLines] = useState<LineItem[]>([])
  const [itemSearch, setItemSearch] = useState("")
  const [searchResults, setSearchResults] = useState<InvItem[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    // Note: inv_stores has a `status` column ('active'/'closed'), not `is_active`
    // (that column only exists on inv_items) — filter on status here.
    listInvStoresWithStatusActive("id, store_code, name, project_id, status")
      .then(({ data }) => setStores((data ?? []) as InvStore[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onStoreChange = useCallback(async (sid: string) => {
    setStoreId(sid)
    setMrId("")
    setMrs([])
    const store = stores.find(s => s.id === sid)
    if (!store) { setProjectId(""); return }
    setProjectId(store.project_id)

    const { data } = await listInvMaterialRequisitionsByProjectIdAndStoreIdWithStatusIssuedPartiallyIssued(store.project_id, sid)
    setMrs((data ?? []) as MrOption[])
  }, [stores])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const { data } = await listInvItemsByFilterWithIsActive(`name.ilike.%${q}%,item_code.ilike.%${q}%`)
    setSearchResults((data ?? []) as InvItem[])
    setSearching(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(itemSearch), 250)
    return () => clearTimeout(t)
  }, [itemSearch, doSearch])

  function addLine(item: InvItem) {
    setLines(prev => [...prev, {
      tempId: crypto.randomUUID(),
      item_id: item.id,
      item_code: item.item_code,
      item_name: item.name,
      unit_of_measure: item.unit_of_measure,
      quantity: "1",
      condition: "good",
      unit_cost: "",
      remarks: "",
    }])
    setItemSearch("")
    setSearchResults([])
  }

  function updateLine(tempId: string, field: keyof LineItem, value: string) {
    setLines(prev => prev.map(l => l.tempId === tempId ? { ...l, [field]: value } : l))
  }

  function removeLine(tempId: string) {
    setLines(prev => prev.filter(l => l.tempId !== tempId))
  }

  async function submit() {
    if (!storeId) { toast.error("Select a store"); return }
    if (!returnDate) { toast.error("Select a return date"); return }
    if (lines.length === 0) { toast.error("Add at least one item to return"); return }
    if (lines.some(l => parseFloat(l.quantity) <= 0)) {
      toast.error("All quantities must be greater than zero")
      return
    }

    const payload = {
      project_id: projectId,
      store_id: storeId,
      mr_id: mrId || null,
      return_date: returnDate,
      lines: lines.map(l => ({
        item_id: l.item_id,
        quantity: parseFloat(l.quantity),
        condition: l.condition,
        // API expects a decimal string (e.g. "12.50"), not a native float — see inv-schemas.ts decimalMoneyString.
        unit_cost: l.unit_cost !== "" ? parseFloat(l.unit_cost).toFixed(2) : null,
        remarks: l.remarks || null,
      })),
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/inv/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create return")
      toast.success(`Return ${json.data.return_number} created`)
      router.push(`/dashboard/inventory/returns/${json.data.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/returns")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-muted-foreground" />
            New Return to Store
          </h1>
          <p className="text-sm text-muted-foreground">Return surplus, damaged, or scrap material back to the project store</p>
        </div>
      </div>

      {/* Header form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Return Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Store <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={storeId}
              onChange={e => onStoreChange(e.target.value)}
            >
              <option value="">Select store…</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.store_code})</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Material Requisition (optional)</Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={mrId}
              onChange={e => setMrId(e.target.value)}
              disabled={!storeId}
            >
              <option value="">No specific MR</option>
              {mrs.map(m => <option key={m.id} value={m.id}>{m.mr_number}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Return Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader><CardTitle className="text-base">Items to Return</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search item by name or code…"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
            />
            {(searching || searchResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                {searching ? (
                  <div className="py-3 text-center text-sm text-muted-foreground">Searching…</div>
                ) : searchResults.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent"
                    onClick={() => addLine(item)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{item.item_code}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span className="font-medium">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-10 text-center">
              <p className="text-sm text-muted-foreground">Search and add items above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm min-w-[750px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">Quantity</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-32">Condition</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">Unit Cost</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Remarks</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map(l => (
                    <tr key={l.tempId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-xs">{l.item_code}</p>
                        <p className="text-xs text-muted-foreground">{l.item_name} / {l.unit_of_measure}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min="0.01" step="any"
                          className="h-8 text-xs text-right"
                          value={l.quantity}
                          onChange={e => updateLine(l.tempId, "quantity", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="flex h-8 w-full rounded border border-input bg-transparent px-2 text-xs"
                          value={l.condition}
                          onChange={e => updateLine(l.tempId, "condition", e.target.value)}
                        >
                          {Object.entries(RETURN_CONDITION_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min="0" step="0.01"
                          className="h-8 text-xs text-right"
                          placeholder="Optional"
                          value={l.unit_cost}
                          onChange={e => updateLine(l.tempId, "unit_cost", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Notes"
                          value={l.remarks}
                          onChange={e => updateLine(l.tempId, "remarks", e.target.value)}
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

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push("/dashboard/inventory/returns")}>Cancel</Button>
        <Button disabled={submitting || lines.length === 0} onClick={submit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Return
        </Button>
      </div>
    </div>
  )
}
