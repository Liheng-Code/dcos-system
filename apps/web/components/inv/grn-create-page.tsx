"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Loader2, AlertTriangle, Truck } from "lucide-react"
import type { InvStore, InvItem } from "./inv-types"
import { listActiveInvItemsForInspection, listInvStoresWithStatusActive, listProcurementPoItemsByPoId, listProcurementPosByProjectIdWithStatusApprovedIssuedPartiallyDelivered } from "@/lib/inv/inventory-queries";

interface PoOption {
  id: string
  po_number: string
  status: string
  project_id: string | null
  procurement_suppliers: { supplier_name: string } | null
}

interface PoItem {
  id: string
  item_code: string | null
  item_description: string
  unit: string
  quantity_ordered: number
  quantity_delivered: number
  unit_price: number
}

interface GrnLine {
  po_item_id: string | null
  item_id: string | null
  item_code: string
  item_name: string
  unit_of_measure: string
  quantity_ordered: number
  quantity_outstanding: number
  quantity_received: string
  unit_cost: string
  batch_number: string
  condition_notes: string
  inspection_required: boolean
  unmatched: boolean
}

export function GrnCreatePage() {
  const router = useRouter()

  const [submitting, setSubmitting] = useState(false)
  const [loadingPos, setLoadingPos] = useState(false)
  const [loadingPoItems, setLoadingPoItems] = useState(false)

  const [stores, setStores] = useState<InvStore[]>([])
  const [pos, setPos] = useState<PoOption[]>([])
  const [invItems, setInvItems] = useState<InvItem[]>([])
  const [lines, setLines] = useState<GrnLine[]>([])

  const [storeId, setStoreId] = useState("")
  const [poId, setPoId] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [projectId, setProjectId] = useState("")
  const [deliveryNote, setDeliveryNote] = useState("")
  const [vehiclePlate, setVehiclePlate] = useState("")
  const [driverName, setDriverName] = useState("")
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10))
  const [receivedTime, setReceivedTime] = useState(
    new Date().toTimeString().slice(0, 5)
  )
  const [remarks, setRemarks] = useState("")

  // Load stores on mount
  useEffect(() => {
    listInvStoresWithStatusActive("id, store_code, name, project_id, status")
      .then(({ data }) => setStores((data ?? []) as InvStore[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When store changes, load POs for that project
  const onStoreChange = useCallback(async (sid: string) => {
    setStoreId(sid)
    setPoId("")
    setPoNumber("")
    setLines([])

    const store = stores.find(s => s.id === sid)
    if (!store) { setProjectId(""); return }
    setProjectId(store.project_id)

    setLoadingPos(true)
    const { data } = await listProcurementPosByProjectIdWithStatusApprovedIssuedPartiallyDelivered(store.project_id)
    setPos((data ?? []) as unknown as PoOption[])
    setLoadingPos(false)
  }, [stores])

  // When PO changes, load its items and match to inv_items
  const onPoChange = useCallback(async (pid: string) => {
    setPoId(pid)
    setLines([])
    if (!pid) { setPoNumber(""); return }

    const po = pos.find(p => p.id === pid)
    setPoNumber(po?.po_number ?? "")

    setLoadingPoItems(true)
    const [poItemsRes, invItemsRes] = await Promise.all([
      listProcurementPoItemsByPoId(pid),
      listActiveInvItemsForInspection(),
    ])

    const poItems = (poItemsRes.data ?? []) as PoItem[]
    const allInvItems = (invItemsRes.data ?? []) as InvItem[]
    setInvItems(allInvItems)

    const codeMap = new Map(allInvItems.map(i => [i.item_code.toLowerCase(), i]))

    const newLines: GrnLine[] = poItems.map(pi => {
      const matched = pi.item_code ? codeMap.get(pi.item_code.toLowerCase()) : undefined
      const outstanding = Math.max(0, pi.quantity_ordered - (pi.quantity_delivered ?? 0))
      return {
        po_item_id: pi.id,
        item_id: matched?.id ?? null,
        item_code: matched?.item_code ?? pi.item_code ?? "",
        item_name: matched?.name ?? pi.item_description,
        unit_of_measure: matched?.unit_of_measure ?? pi.unit,
        quantity_ordered: pi.quantity_ordered,
        quantity_outstanding: outstanding,
        quantity_received: String(outstanding),
        unit_cost: String(pi.unit_price ?? "0"),
        batch_number: "",
        condition_notes: "",
        inspection_required: matched?.is_inspection_required ?? false,
        unmatched: !matched,
      }
    })
    setLines(newLines)
    setLoadingPoItems(false)
  }, [pos])

  function updateLine(idx: number, field: keyof GrnLine, value: string | boolean) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function onInvItemSelect(idx: number, itemId: string) {
    const item = invItems.find(i => i.id === itemId)
    if (!item) return
    setLines(prev => prev.map((l, i) => i === idx ? {
      ...l,
      item_id: item.id,
      item_code: item.item_code,
      item_name: item.name,
      unit_of_measure: item.unit_of_measure,
      inspection_required: item.is_inspection_required,
      unmatched: false,
    } : l))
  }

  async function submit(confirmImmediately: boolean) {
    if (!storeId) { toast.error("Select a store"); return }
    if (!poId) { toast.error("Select a Purchase Order"); return }
    if (lines.length === 0) { toast.error("No line items to receive"); return }

    const unmatchedLines = lines.filter(l => !l.item_id)
    if (unmatchedLines.length > 0) {
      toast.error(`${unmatchedLines.length} line(s) have no inventory item selected`)
      return
    }

    const invalidQty = lines.some(l => parseFloat(l.quantity_received) <= 0)
    if (invalidQty) { toast.error("All received quantities must be greater than zero"); return }

    const payload = {
      project_id: projectId,
      store_id: storeId,
      po_id: poId,
      po_number: poNumber,
      supplier_delivery_note: deliveryNote || null,
      vehicle_plate: vehiclePlate || null,
      driver_name: driverName || null,
      received_date: receivedDate,
      received_time: receivedTime || null,
      remarks: remarks || null,
      lines: lines.map(l => ({
        item_id: l.item_id!,
        po_item_id: l.po_item_id,
        quantity_ordered: l.quantity_ordered,
        quantity_received: parseFloat(l.quantity_received),
        unit_cost: l.unit_cost,
        batch_number: l.batch_number || null,
        condition_notes: l.condition_notes || null,
        inspection_required: l.inspection_required,
      })),
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/inv/grns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create GRN")

      if (confirmImmediately) {
        const confirmRes = await fetch(`/api/inv/grns/${json.data.id}/confirm`, { method: "POST" })
        if (!confirmRes.ok) {
          toast.warning("GRN saved but confirmation failed — confirm manually from the detail page")
        } else {
          toast.success("GRN confirmed — stock updated")
        }
      } else {
        toast.success("GRN saved as draft")
      }
      router.push("/dashboard/inventory/grns")
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
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/grns")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5 text-muted-foreground" />
            Create Goods Received Note
          </h1>
          <p className="text-sm text-muted-foreground">Record a supplier delivery against a Purchase Order</p>
        </div>
      </div>

      {/* Header form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Delivery Details</CardTitle></CardHeader>
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
            <Label>Purchase Order <span className="text-destructive">*</span></Label>
            {loadingPos ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <select
                className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={poId}
                onChange={e => onPoChange(e.target.value)}
                disabled={!storeId}
              >
                <option value="">Select PO…</option>
                {pos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.po_number} — {p.procurement_suppliers?.supplier_name ?? "Unknown supplier"} ({p.status})
                  </option>
                ))}
              </select>
            )}
            {storeId && !loadingPos && pos.length === 0 && (
              <p className="text-xs text-muted-foreground">No approved POs found for this project.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Supplier Delivery Note</Label>
            <Input placeholder="DN-2024-001" value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Vehicle Plate</Label>
            <Input placeholder="ABC 1234" value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Driver Name</Label>
            <Input placeholder="Driver name" value={driverName} onChange={e => setDriverName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Received Date <span className="text-destructive">*</span></Label>
            <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Received Time</Label>
            <Input type="time" value={receivedTime} onChange={e => setReceivedTime(e.target.value)} />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Remarks</Label>
            <Input placeholder="Optional notes" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
          {!poId && <p className="text-sm text-muted-foreground">Select a Purchase Order above to populate lines.</p>}
        </CardHeader>
        <CardContent>
          {loadingPoItems ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : lines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {poId ? "This PO has no line items." : "No lines yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-48">Item</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">UoM</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">PO Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">Received Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">Unit Cost</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Batch No.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Condition</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Inspect?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, idx) => (
                    <tr key={idx} className={line.unmatched ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                      <td className="px-3 py-2">
                        {line.unmatched ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-amber-700 text-xs">
                              <AlertTriangle className="h-3 w-3" />
                              {line.item_code || line.item_name} — not in item master
                            </div>
                            <select
                              className="flex w-full h-8 rounded border border-input bg-transparent px-2 text-xs"
                              value=""
                              onChange={e => onInvItemSelect(idx, e.target.value)}
                            >
                              <option value="">Map to item…</option>
                              {invItems.map(i => (
                                <option key={i.id} value={i.id}>{i.item_code} — {i.name}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium text-xs">{line.item_code}</div>
                            <div className="text-muted-foreground text-xs">{line.item_name}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{line.unit_of_measure}</td>
                      <td className="px-3 py-2 text-right text-xs">{line.quantity_ordered}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium">{line.quantity_outstanding}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          max={line.quantity_outstanding}
                          step="any"
                          className="h-8 text-xs text-right"
                          value={line.quantity_received}
                          onChange={e => updateLine(idx, "quantity_received", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="h-8 text-xs text-right"
                          value={line.unit_cost}
                          onChange={e => updateLine(idx, "unit_cost", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Batch no."
                          value={line.batch_number}
                          onChange={e => updateLine(idx, "batch_number", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Notes"
                          value={line.condition_notes}
                          onChange={e => updateLine(idx, "condition_notes", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={line.inspection_required}
                          onChange={e => updateLine(idx, "inspection_required", e.target.checked)}
                          className="h-4 w-4"
                        />
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
        <Button variant="outline" onClick={() => router.push("/dashboard/inventory/grns")}>
          Cancel
        </Button>
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={submitting || lines.length === 0}
            onClick={() => submit(false)}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button
            disabled={submitting || lines.length === 0}
            onClick={() => submit(true)}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm GRN
          </Button>
        </div>
      </div>
    </div>
  )
}
