"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Search, Plus, Trash2, Loader2, ArrowLeftRight, AlertTriangle } from "lucide-react"
import type { InvStore, InvItem } from "./inv-types"

interface ProjectOption {
  id: string
  project_code: string
  project_name: string
}

interface TransferLine {
  item_id: string
  item_code: string
  item_name: string
  unit_of_measure: string
  quantity_requested: string
}

interface StockBalance {
  item_id: string
  quantity_available: number
}

export function TransferCreatePage() {
  const router = useRouter()
  const supabase = createClient()

  const [submitting, setSubmitting] = useState(false)

  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [stores, setStores] = useState<InvStore[]>([])
  const [itemSearch, setItemSearch] = useState("")
  const [searchResults, setSearchResults] = useState<InvItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [lines, setLines] = useState<TransferLine[]>([])
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())

  const [transferType, setTransferType] = useState<"intra_project" | "inter_project">("intra_project")
  const [sourceProjectId, setSourceProjectId] = useState("")
  const [sourceStoreId, setSourceStoreId] = useState("")
  const [destProjectId, setDestProjectId] = useState("")
  const [destStoreId, setDestStoreId] = useState("")
  const [transferReason, setTransferReason] = useState("")

  // Load projects and stores
  useEffect(() => {
    Promise.all([
      supabase.from("projects").select("id, project_code, project_name").order("project_code"),
      supabase.from("inv_stores").select("id, store_code, name, project_id, is_active").eq("is_active", true).order("name"),
    ]).then(([projRes, storeRes]) => {
      setProjects((projRes.data ?? []) as ProjectOption[])
      setStores((storeRes.data ?? []) as InvStore[])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Compute filtered stores from current selections
  const sourceStores = useMemo(
    () => sourceProjectId ? stores.filter(s => s.project_id === sourceProjectId) : [],
    [sourceProjectId, stores],
  )
  const destStores = useMemo(
    () => destProjectId ? stores.filter(s => s.project_id === destProjectId) : [],
    [destProjectId, stores],
  )

  // Clear store selections when project changes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSourceStoreId("") }, [sourceProjectId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDestStoreId("") }, [destProjectId])

  // When intra-project, auto-set dest project = source project
  function onSourceProjectChange(pid: string) {
    setSourceProjectId(pid)
    if (transferType === "intra_project") setDestProjectId(pid)
  }

  // Load stock for source store when lines change
  useEffect(() => {
    if (!sourceStoreId || lines.length === 0) return
    const itemIds = lines.map(l => l.item_id)
    supabase
      .from("inv_stock")
      .select("item_id, quantity_available")
      .eq("store_id", sourceStoreId)
      .in("item_id", itemIds)
      .then(({ data }) => {
        const m = new Map((data ?? []).map((s: StockBalance) => [s.item_id, s.quantity_available]))
        setStockMap(m)
      })
  }, [sourceStoreId, lines.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Item search
  const searchItems = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearchLoading(true)
    const { data } = await supabase
      .from("inv_items")
      .select("id, item_code, name, category, unit_of_measure, is_active")
      .eq("is_active", true)
      .or(`name.ilike.%${q}%,item_code.ilike.%${q}%`)
      .limit(20)
    setSearchResults((data ?? []) as InvItem[])
    setSearchLoading(false)
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => searchItems(itemSearch), 300)
    return () => clearTimeout(t)
  }, [itemSearch, searchItems])

  function addLine(item: InvItem) {
    if (lines.find(l => l.item_id === item.id)) { toast.info("Item already in the list"); return }
    setLines(prev => [...prev, {
      item_id: item.id,
      item_code: item.item_code,
      item_name: item.name,
      unit_of_measure: item.unit_of_measure,
      quantity_requested: "1",
    }])
    setItemSearch("")
    setSearchResults([])
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLine(idx: number, val: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity_requested: val } : l))
  }

  async function submit() {
    if (!sourceStoreId) { toast.error("Select a source store"); return }
    if (!destStoreId) { toast.error("Select a destination store"); return }
    if (sourceStoreId === destStoreId) { toast.error("Source and destination stores must be different"); return }
    if (!transferReason.trim()) { toast.error("Enter a transfer reason"); return }
    if (lines.length === 0) { toast.error("Add at least one item"); return }
    if (lines.some(l => parseFloat(l.quantity_requested) <= 0)) { toast.error("All quantities must be greater than zero"); return }

    const payload = {
      transfer_type: transferType,
      source_project_id: sourceProjectId,
      source_store_id: sourceStoreId,
      destination_project_id: destProjectId,
      destination_store_id: destStoreId,
      transfer_reason: transferReason,
      lines: lines.map(l => ({
        item_id: l.item_id,
        quantity_requested: parseFloat(l.quantity_requested),
      })),
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/inv/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create transfer")
      toast.success("Transfer created")
      router.push("/dashboard/inventory/transfers")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/transfers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
            New Stock Transfer
          </h1>
          <p className="text-sm text-muted-foreground">Move stock between stores</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Transfer Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Transfer Type <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={transferType}
              onChange={e => setTransferType(e.target.value as "intra_project" | "inter_project")}
            >
              <option value="intra_project">Intra-Project (same project)</option>
              <option value="inter_project">Inter-Project (different projects)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Source Project <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={sourceProjectId}
              onChange={e => onSourceProjectChange(e.target.value)}
            >
              <option value="">Select source project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Source Store <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={sourceStoreId}
              onChange={e => setSourceStoreId(e.target.value)}
              disabled={!sourceProjectId}
            >
              <option value="">Select source store…</option>
              {sourceStores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.store_code})</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Destination Project <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={destProjectId}
              onChange={e => setDestProjectId(e.target.value)}
              disabled={transferType === "intra_project"}
            >
              {transferType === "intra_project" ? (
                <option value={sourceProjectId}>
                  {projects.find(p => p.id === sourceProjectId)?.project_code ?? "Same as source"}
                </option>
              ) : (
                <>
                  <option value="">Select destination project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
                </>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Destination Store <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={destStoreId}
              onChange={e => setDestStoreId(e.target.value)}
              disabled={!destProjectId}
            >
              <option value="">Select destination store…</option>
              {destStores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.store_code})</option>)}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Transfer Reason <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Why is this stock being transferred?"
              value={transferReason}
              onChange={e => setTransferReason(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items to Transfer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search item by name or code…"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
            />
            {(searchLoading || searchResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                {searchLoading ? (
                  <div className="py-3 text-center text-sm text-muted-foreground">Searching…</div>
                ) : searchResults.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent"
                    onClick={() => addLine(item)}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{item.item_code}</span>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className="font-medium">{item.name}</span>
                      <span className="mx-1.5 text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{item.unit_of_measure}</span>
                    </div>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">UoM</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Available</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-32">Transfer Qty</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => {
                    const available = stockMap.get(line.item_id) ?? 0
                    const qty = parseFloat(line.quantity_requested) || 0
                    const insufficient = qty > available && available >= 0
                    return (
                      <tr key={line.item_id} className={insufficient ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs">{line.item_code}</div>
                          <div className="text-muted-foreground text-xs">{line.item_name}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{line.unit_of_measure}</td>
                        <td className="px-4 py-3 text-right text-xs">
                          <span className={available === 0 ? "text-red-600 font-semibold" : ""}>
                            {available}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <Input
                              type="number"
                              min="0.01"
                              step="any"
                              className="h-8 text-xs text-right"
                              value={line.quantity_requested}
                              onChange={e => updateLine(idx, e.target.value)}
                            />
                            {insufficient && (
                              <div className="flex items-center gap-1 text-xs text-amber-700">
                                <AlertTriangle className="h-3 w-3" />
                                Insufficient stock
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLine(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push("/dashboard/inventory/transfers")}>
          Cancel
        </Button>
        <Button disabled={submitting || lines.length === 0} onClick={submit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Transfer
        </Button>
      </div>
    </div>
  )
}
