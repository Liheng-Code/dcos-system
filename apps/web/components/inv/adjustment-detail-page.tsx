"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
import { ArrowLeft, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import { REASON_CODE_LABELS } from "./inv-types"
import type { AdjustmentRow, AdjustmentLineRow } from "./inv-types"
import { getInvAdjustmentById, listInvAdjustmentLinesByAdjustmentId, listInvAuditLogByRecordIdWithTableNameInvAdjustments } from "@/lib/inv/inventory-queries";

interface Props {
  id: string
}

export function AdjustmentDetailPage({ id }: Props) {
  const router = useRouter()
  const [adj, setAdj] = useState<AdjustmentRow | null>(null)
  const [lines, setLines] = useState<AdjustmentLineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const [showReject, setShowReject] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  const [auditLog, setAuditLog] = useState<Array<{
    action: string; performed_by: string; created_at: string; old_status: string | null; new_status: string | null
  }>>([])

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([
      getInvAdjustmentById(id),
      listInvAdjustmentLinesByAdjustmentId(id),
      listInvAuditLogByRecordIdWithTableNameInvAdjustments(id),
    ]).then(([adjRes, linesRes, auditRes]) => {
      if (adjRes.error || !adjRes.data) { setError("Adjustment not found"); return }
      setAdj(adjRes.data as unknown as AdjustmentRow)
      setLines(linesRes.data as unknown as AdjustmentLineRow[])
      setAuditLog(auditRes.data as Array<{
        action: string; performed_by: string; created_at: string; old_status: string | null; new_status: string | null
      }>)
    }).catch(e => setError((e as Error).message))
    .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  async function handleApprove() {
    setActing(true)
    try {
      const res = await fetch(`/api/inv/adjustments/${id}/approve`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Approval failed")
      toast.success("Adjustment approved")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) { toast.error("Rejection reason is required"); return }
    setActing(true)
    try {
      const res = await fetch(`/api/inv/adjustments/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: rejectionReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Rejection failed")
      toast.success("Adjustment rejected")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
      setShowReject(false)
    }
  }

  const profile = adj?.profiles as { full_name: string | null; email: string } | null

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  if (error || !adj) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-destructive font-medium">{error ?? "Adjustment not found"}</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{adj.adjustment_number}</h1>
            <InvStatusBadge status={adj.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {REASON_CODE_LABELS[adj.reason_code] ?? adj.reason_code}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Basic info */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Store</p>
            <p className="font-medium">{adj.inv_stores?.name ?? adj.store_id.slice(0, 8) + "…"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reason</p>
            <p className="font-medium">{REASON_CODE_LABELS[adj.reason_code] ?? adj.reason_code}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Description</p>
            <p className="font-medium">{adj.reason_description}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Requested By</p>
            <p className="font-medium">{profile?.full_name ?? profile?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="font-medium">{format(new Date(adj.created_at), "dd MMM yyyy HH:mm")}</p>
          </div>
          {adj.approved_at && (
            <div>
              <p className="text-xs text-muted-foreground">Approved At</p>
              <p className="font-medium">{format(new Date(adj.approved_at), "dd MMM yyyy HH:mm")}</p>
            </div>
          )}
          {adj.rejection_reason && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Rejection Reason</p>
              <p className="font-medium text-destructive">{adj.rejection_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Items ({lines.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Before</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Adjustment</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">After</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Cost Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map(l => {
                  const item = l.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                  const isIncrease = l.quantity_adjusted > 0
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{item?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{item?.item_code}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{l.quantity_before.toFixed(2)}</td>
                      <td className={[
                        "px-4 py-2.5 text-right font-mono tabular-nums font-medium",
                        isIncrease ? "text-emerald-700" : "text-red-700",
                      ].join(" ")}>
                        {isIncrease ? "+" : ""}{l.quantity_adjusted.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{l.quantity_after.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {l.unit_cost != null ? l.unit_cost.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {l.cost_impact != null ? l.cost_impact.toFixed(2) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {adj.status === "pending_approval" && (
        <div className="flex justify-end gap-3">
          <Button variant="destructive" onClick={() => setShowReject(true)} disabled={acting}>
            <XCircle className="mr-2 h-4 w-4" />Reject
          </Button>
          <Button onClick={handleApprove} disabled={acting}>
            {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <CheckCircle2 className="mr-2 h-4 w-4" />Approve
          </Button>
        </div>
      )}

      {/* Audit timeline */}
      {auditLog.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {auditLog.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium capitalize">{entry.action.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.old_status && entry.new_status
                      ? `${entry.old_status} → ${entry.new_status}`
                      : entry.new_status ?? ""}
                    {" · "}
                    {format(new Date(entry.created_at), "dd MMM yyyy HH:mm")}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Reject dialog */}
      <AlertDialog open={showReject} onOpenChange={setShowReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Adjustment</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for rejecting this adjustment. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label>Rejection Reason</Label>
            <Input
              placeholder="e.g. Incorrect quantities, needs re-count"
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectionReason("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleReject} disabled={acting}>
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
