"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2, Package } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import type { GrnRow, GrnLineRow } from "./inv-types"

interface GrnDetail extends GrnRow {
  supplier_delivery_note: string | null
  vehicle_plate: string | null
  driver_name: string | null
  received_time: string | null
  remarks: string | null
  confirmed_by: string | null
  inv_grn_lines: GrnLineRow[]
}

export function GrnDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [grn, setGrn] = useState<GrnDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from("inv_grns")
      .select(`
        *,
        inv_grn_lines(
          id, item_id, po_item_id, quantity_ordered, quantity_received,
          unit_cost, total_cost, batch_number, inspection_required,
          inspection_status, condition_notes,
          inv_items(item_code, name, unit_of_measure)
        )
      `)
      .eq("id", id)
      .single()
    if (e || !data) {
      setError("GRN not found")
    } else {
      setGrn(data as unknown as GrnDetail)
    }
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { load() }, [load])

  async function confirmGrn() {
    setConfirming(true)
    try {
      const res = await fetch(`/api/inv/grns/${id}/confirm`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Confirmation failed")
      toast.success("GRN confirmed — stock updated")
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setConfirming(false)
      setShowConfirmDialog(false)
    }
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (error || !grn) return (
    <div className="max-w-5xl mx-auto">
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground mb-3">{error ?? "GRN not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/inventory/grns")}>Back to list</Button>
        </CardContent>
      </Card>
    </div>
  )

  const pendingInspectionLines = grn.inv_grn_lines.filter(
    l => l.inspection_required && l.inspection_status === "pending"
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/grns")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold font-mono">{grn.grn_number}</h1>
              <InvStatusBadge status={grn.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Received {format(new Date(grn.received_date), "dd MMM yyyy")}
              {grn.received_time ? ` at ${grn.received_time}` : ""}
            </p>
          </div>
        </div>
        {grn.status === "draft" && (
          <Button onClick={() => setShowConfirmDialog(true)} disabled={confirming}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Confirm GRN
          </Button>
        )}
      </div>

      {/* Status banners */}
      {grn.status === "confirmed" && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          GRN confirmed — stock has been updated in the system.
        </div>
      )}
      {pendingInspectionLines.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Pending QA/QC inspection for {pendingInspectionLines.length} item(s) before these can be moved to available stock.
        </div>
      )}

      {/* Header details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Delivery Details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">PO Number</dt>
              <dd className="font-mono font-medium">{grn.po_number || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Delivery Note</dt>
              <dd>{grn.supplier_delivery_note || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Vehicle Plate</dt>
              <dd>{grn.vehicle_plate || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Driver</dt>
              <dd>{grn.driver_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Received Date</dt>
              <dd>{format(new Date(grn.received_date), "dd MMM yyyy")}</dd>
            </div>
            {grn.remarks && (
              <div className="col-span-full">
                <dt className="text-xs text-muted-foreground">Remarks</dt>
                <dd className="text-muted-foreground">{grn.remarks}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Line Items ({grn.inv_grn_lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {grn.inv_grn_lines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No line items.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[750px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">UoM</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Received Qty</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total Cost</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Batch No.</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {grn.inv_grn_lines.map(line => {
                    const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                    return (
                      <tr key={line.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs">{item?.item_code ?? "—"}</div>
                          <div className="text-muted-foreground text-xs">{item?.name ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{item?.unit_of_measure ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{line.quantity_received}</td>
                        <td className="px-4 py-3 text-right text-xs">{Number(line.unit_cost).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-xs">{Number(line.total_cost).toFixed(2)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{line.batch_number || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {line.inspection_required ? (
                            <Badge
                              variant={line.inspection_status === "approved" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {line.inspection_status === "approved" ? "Passed" :
                               line.inspection_status === "rejected" ? "Failed" :
                               line.inspection_status === "pending" ? "Pending" : "N/A"}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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

      {/* Confirm dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm GRN?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the stock balance in {grn.inv_grn_lines.length} item(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmGrn} disabled={confirming}>
              {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
