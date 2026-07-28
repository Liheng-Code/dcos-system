"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Search, Plus, Trash2, Loader2, ClipboardList, AlertTriangle } from "lucide-react"
import type { InvStore, InvItem } from "./inv-types"

interface WbsNode {
  id: string
  wbs_code: string
  wbs_name: string
  full_path: string | null
}

interface WbsTask {
  id: string
  task_code: string
  task_name: string
  cost_code: string | null
}

interface StockBalance {
  item_id: string
  quantity_available: number
}

interface MrLine {
  item_id: string
  item_code: string
  item_name: string
  unit_of_measure: string
  available_stock: number
  quantity_requested: string
  remarks: string
}

export function MrCreatePage() {
  const router = useRouter()
  const supabase = createClient()

  const [submitting, setSubmitting] = useState(false)
  const [stores, setStores] = useState<InvStore[]>([])
  const [wbsNodes, setWbsNodes] = useState<WbsNode[]>([])
  const [wbsTasks, setWbsTasks] = useState<WbsTask[]>([])
  const [itemSearch, setItemSearch] = useState("")
  const [searchResults, setSearchResults] = useState<InvItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [lines, setLines] = useState<MrLine[]>([])
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())

  const [storeId, setStoreId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [wbsNodeId, setWbsNodeId] = useState("")
  const [taskId, setTaskId] = useState("")
  const [costCode, setCostCode] = useState("")
  const [requiredDate, setRequiredDate] = useState("")
  const [remarks, setRemarks] = useState("")

  // Load stores
  useEffect(() => {
    supabase
      .from("inv_stores")
      .select("id, store_code, name, project_id, status")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setStores((data ?? []) as InvStore[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When store changes, load WBS nodes for that project
  const onStoreChange = useCallback(async (sid: string) => {
    setStoreId(sid)
    setWbsNodeId("")
    setTaskId("")
    setCostCode("")
    const store = stores.find(s => s.id === sid)
    if (!store) { setProjectId(""); setWbsNodes([]); return }
    setProjectId(store.project_id)

    const { data } = await supabase
      .from("wbs_nodes")
      .select("id, wbs_code, wbs_name, full_path")
      .eq("project_id", store.project_id)
      .order("wbs_code")
    setWbsNodes((data ?? []) as WbsNode[])
  }, [stores, supabase])

  // When WBS node changes, load tasks
  const onWbsChange = useCallback(async (nid: string) => {
    setWbsNodeId(nid)
    setTaskId("")
    setCostCode("")
    setWbsTasks([])
    if (!nid) return

    const { data } = await supabase
      .from("wbs_tasks")
      .select("id, task_code, task_name, cost_code")
      .eq("wbs_node_id", nid)
      .order("task_code")
    setWbsTasks((data ?? []) as WbsTask[])
  }, [supabase])

  // When task changes, auto-populate cost code
  function onTaskChange(tid: string) {
    setTaskId(tid)
    const task = wbsTasks.find(t => t.id === tid)
    if (task?.cost_code) setCostCode(task.cost_code)
  }

  // Load stock balances for the selected store when lines change
  useEffect(() => {
    if (!storeId || lines.length === 0) return
    const itemIds = lines.map(l => l.item_id)
    supabase
      .from("inv_stock")
      .select("item_id, quantity_available")
      .eq("store_id", storeId)
      .in("item_id", itemIds)
      .then(({ data }) => {
        const m = new Map((data ?? []).map((s: { item_id: string; quantity_available: number }) => [s.item_id, s.quantity_available]))
        setStockMap(m)
        setLines(prev => prev.map(l => ({ ...l, available_stock: m.get(l.item_id) ?? 0 })))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, lines.length])

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
    if (lines.find(l => l.item_id === item.id)) {
      toast.info("Item already in the list")
      return
    }
    setLines(prev => [...prev, {
      item_id: item.id,
      item_code: item.item_code,
      item_name: item.name,
      unit_of_measure: item.unit_of_measure,
      available_stock: stockMap.get(item.id) ?? 0,
      quantity_requested: "1",
      remarks: "",
    }])
    setItemSearch("")
    setSearchResults([])
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLine(idx: number, field: "quantity_requested" | "remarks", value: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  async function submit(asDraft: boolean) {
    if (!storeId) { toast.error("Select a store"); return }
    if (!wbsNodeId) { toast.error("Select a WBS node"); return }
    if (!costCode.trim()) { toast.error("Enter a cost code"); return }
    if (!requiredDate) { toast.error("Select a required date"); return }
    if (lines.length === 0) { toast.error("Add at least one item"); return }
    if (lines.some(l => parseFloat(l.quantity_requested) <= 0)) {
      toast.error("All requested quantities must be greater than zero")
      return
    }

    const payload = {
      project_id: projectId,
      store_id: storeId,
      wbs_node_id: wbsNodeId,
      task_id: taskId || null,
      cost_code: costCode,
      required_date: requiredDate,
      remarks: remarks || null,
      lines: lines.map(l => ({
        item_id: l.item_id,
        quantity_requested: parseFloat(l.quantity_requested),
        remarks: l.remarks || null,
      })),
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/inv/mrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create MR")

      if (!asDraft) {
        const submitRes = await fetch(`/api/inv/mrs/${json.data.id}/submit`, { method: "POST" })
        if (!submitRes.ok) {
          toast.warning("MR saved but submission failed — submit manually from the detail page")
        } else {
          toast.success("MR submitted for approval")
        }
      } else {
        toast.success("MR saved as draft")
      }
      router.push("/dashboard/inventory/mrs")
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
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/mrs")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            New Material Requisition
          </h1>
          <p className="text-sm text-muted-foreground">Request materials from the project store for a task</p>
        </div>
      </div>

      {/* Header form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Requisition Details</CardTitle></CardHeader>
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
            <Label>WBS Node <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={wbsNodeId}
              onChange={e => onWbsChange(e.target.value)}
              disabled={!storeId}
            >
              <option value="">Select WBS node…</option>
              {wbsNodes.map(n => (
                <option key={n.id} value={n.id}>{n.wbs_code} — {n.wbs_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Task (optional)</Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={taskId}
              onChange={e => onTaskChange(e.target.value)}
              disabled={!wbsNodeId || wbsTasks.length === 0}
            >
              <option value="">No specific task</option>
              {wbsTasks.map(t => (
                <option key={t.id} value={t.id}>{t.task_code} — {t.task_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Cost Code <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. CONC-02"
              value={costCode}
              onChange={e => setCostCode(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Required By Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={requiredDate} onChange={e => setRequiredDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Input placeholder="Optional notes" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Item search + lines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items to Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Item search */}
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

          {/* Lines table */}
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
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-32">Requested Qty</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Notes</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => {
                    const qty = parseFloat(line.quantity_requested) || 0
                    const insufficient = qty > line.available_stock && line.available_stock >= 0
                    return (
                      <tr key={line.item_id} className={insufficient ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs">{line.item_code}</div>
                          <div className="text-muted-foreground text-xs">{line.item_name}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{line.unit_of_measure}</td>
                        <td className="px-4 py-3 text-right text-xs">
                          <span className={line.available_stock === 0 ? "text-red-600 font-semibold" : ""}>
                            {line.available_stock}
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
                              onChange={e => updateLine(idx, "quantity_requested", e.target.value)}
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
                          <Input
                            className="h-8 text-xs"
                            placeholder="Notes"
                            value={line.remarks}
                            onChange={e => updateLine(idx, "remarks", e.target.value)}
                          />
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

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push("/dashboard/inventory/mrs")}>
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={submitting || lines.length === 0}
            onClick={() => submit(true)}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button
            disabled={submitting || lines.length === 0}
            onClick={() => submit(false)}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for Approval
          </Button>
        </div>
      </div>
    </div>
  )
}
