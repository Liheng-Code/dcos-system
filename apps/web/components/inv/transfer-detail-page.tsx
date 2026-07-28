"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2,
  Package, Truck, MapPin,
} from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import type { TransferRow, TransferLineRow } from "./inv-types"

interface TransferDetailData extends Omit<TransferRow, "inv_transfer_lines"> {
  transfer_number: string
  transfer_type: "intra_project" | "inter_project"
  source_project_id: string
  source_store_id: string
  destination_project_id: string
  destination_store_id: string
  status: string
  transfer_reason: string
  requested_by: string
  source_approved_by: string | null
  source_approved_at: string | null
  dest_approved_by: string | null
  dest_approved_at: string | null
  dispatched_by: string | null
  dispatched_at: string | null
  received_by: string | null
  received_at: string | null
  created_at: string
  inv_transfer_lines: (TransferLineRow & { inv_items?: { item_code: string; name: string; unit_of_measure: string } })[]
  source_store?: { name: string; store_code: string } | null
  destination_store?: { name: string; store_code: string } | null
  source_project?: { project_name: string; project_code: string } | null
  destination_project?: { project_name: string; project_code: string } | null
  profiles?: { full_name: string | null; email: string } | null
  source_approver?: { full_name: string | null; email: string } | null
  dest_approver?: { full_name: string | null; email: string } | null
  dispatcher?: { full_name: string | null; email: string } | null
  receiver?: { full_name: string | null; email: string } | null
}

interface AuditEntry {
  id: string
  action: string
  performed_by: string
  created_at: string
  old_status: string | null
  new_status: string | null
  profiles?: { full_name: string | null; email: string } | null
}

const AUDIT_LABELS: Record<string, string> = {
  transfer_created: "Created",
  transfer_source_approved: "Source Approved",
  transfer_dest_approved: "Destination Approved",
  transfer_dispatched: "Dispatched",
  transfer_received: "Received",
  transfer_rejected: "Rejected",
}

export function TransferDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [transfer, setTransfer] = useState<TransferDetailData | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [showDispatchDialog, setShowDispatchDialog] = useState(false)
  const [dispatchQtys, setDispatchQtys] = useState<Record<string, string>>({})
  const [showReceiveDialog, setShowReceiveDialog] = useState(false)
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: tfData, error: tfErr } = await supabase
          .from("inv_transfers")
          .select(`
            *,
            inv_transfer_lines(*, inv_items(item_code, name, unit_of_measure)),
            source_store:source_store_id(name, store_code),
            destination_store:destination_store_id(name, store_code),
            source_project:source_project_id(project_name, project_code),
            destination_project:destination_project_id(project_name, project_code),
            profiles!requested_by(full_name, email),
            source_approver:profiles!source_approved_by(full_name, email),
            dest_approver:profiles!dest_approved_by(full_name, email),
            dispatcher:profiles!dispatched_by(full_name, email),
            receiver:profiles!received_by(full_name, email)
          `)
          .eq("id", id)
          .single()

        if (cancelled) return
        if (tfErr || !tfData) { setError("Transfer not found"); setLoading(false); return }

        setTransfer(tfData as unknown as TransferDetailData)

        const lines = (tfData as unknown as TransferDetailData).inv_transfer_lines ?? []
        const dqty: Record<string, string> = {}
        const rqty: Record<string, string> = {}
        for (const line of lines) {
          dqty[line.id] = String(line.quantity_requested - (line.quantity_dispatched ?? 0))
          rqty[line.id] = String(line.quantity_dispatched ?? line.quantity_requested)
        }
        setDispatchQtys(dqty)
        setReceiveQtys(rqty)

        const { data: auditData } = await supabase
          .from("inv_audit_log")
          .select("*, profiles!performed_by(full_name, email)")
          .eq("table_name", "inv_transfers")
          .eq("record_id", id)
          .order("created_at", { ascending: true })

        if (cancelled) return
        setAuditLog((auditData ?? []) as AuditEntry[])
      } catch {
        if (!cancelled) setError("Failed to load transfer details")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, supabase])

  async function handleApproveSource() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/transfers/${id}/approve-source`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Approval failed")
      toast.success("Source approved")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSubmitting(false) }
  }

  async function handleApproveDest() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/transfers/${id}/approve-dest`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Approval failed")
      toast.success("Destination approved — transfer approved")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSubmitting(false) }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { toast.error("Enter a rejection reason"); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/transfers/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: rejectReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Rejection failed")
      toast.success("Transfer rejected")
      setShowRejectDialog(false)
      setRejectReason("")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSubmitting(false) }
  }

  async function handleDispatch() {
    const lines = transfer?.inv_transfer_lines ?? []
    const dispatchLines = lines
      .map(l => ({ transfer_line_id: l.id, quantity_dispatched: parseFloat(dispatchQtys[l.id] ?? "0") }))
      .filter(l => l.quantity_dispatched > 0)
    if (dispatchLines.length === 0) { toast.error("Enter at least one dispatch quantity"); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/transfers/${id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: dispatchLines }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Dispatch failed")
      toast.success("Transfer dispatched — stock deducted from source")
      setShowDispatchDialog(false)
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSubmitting(false) }
  }

  async function handleReceive() {
    const lines = transfer?.inv_transfer_lines ?? []
    const receiveLines = lines
      .map(l => ({ transfer_line_id: l.id, quantity_received: parseFloat(receiveQtys[l.id] ?? "0") }))
      .filter(l => l.quantity_received > 0)
    if (receiveLines.length === 0) { toast.error("Enter at least one receive quantity"); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/transfers/${id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: receiveLines }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Receive failed")
      toast.success("Transfer received — stock added to destination")
      setShowReceiveDialog(false)
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !transfer) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-3">{error ?? "Transfer not found"}</p>
            <Button variant="outline" onClick={() => router.push("/dashboard/inventory/transfers")}>Back to list</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const requester = transfer.profiles as { full_name: string | null; email: string } | undefined
  const srcApprover = transfer.source_approver as { full_name: string | null; email: string } | undefined
  const dstApprover = transfer.dest_approver as { full_name: string | null; email: string } | undefined
  const dispatcher = transfer.dispatcher as { full_name: string | null; email: string } | undefined
  const receiver = transfer.receiver as { full_name: string | null; email: string } | undefined
  const srcStore = transfer.source_store as { name: string; store_code: string } | undefined
  const dstStore = transfer.destination_store as { name: string; store_code: string } | undefined
  const srcProj = transfer.source_project as { project_name: string; project_code: string } | undefined
  const dstProj = transfer.destination_project as { project_name: string; project_code: string } | undefined

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/transfers")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold font-mono">{transfer.transfer_number}</h1>
              <InvStatusBadge status={transfer.status} />
              <span className="text-xs text-muted-foreground capitalize px-2 py-0.5 rounded-full border">
                {transfer.transfer_type === "intra_project" ? "Intra-Project" : "Inter-Project"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Requested by {requester?.full_name ?? requester?.email ?? "—"} &middot;{" "}
              {format(new Date(transfer.created_at), "dd MMM yyyy")}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {transfer.status === "pending" && !transfer.source_approved_by && (
            <>
              <Button variant="outline" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="mr-2 h-4 w-4" />Reject
              </Button>
              <Button onClick={handleApproveSource} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle2 className="mr-2 h-4 w-4" />Approve Source
              </Button>
            </>
          )}
          {transfer.status === "pending" && transfer.source_approved_by && !transfer.dest_approved_by && (
            <>
              <Button variant="outline" onClick={() => setShowRejectDialog(true)}>
                <XCircle className="mr-2 h-4 w-4" />Reject
              </Button>
              <Button onClick={handleApproveDest} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle2 className="mr-2 h-4 w-4" />Approve Destination
              </Button>
            </>
          )}
          {transfer.status === "approved" && (
            <Button onClick={() => setShowDispatchDialog(true)}>
              <Truck className="mr-2 h-4 w-4" />Dispatch
            </Button>
          )}
          {transfer.status === "in_transit" && (
            <Button onClick={() => setShowReceiveDialog(true)}>
              <MapPin className="mr-2 h-4 w-4" />Receive
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Transfer Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Reason</dt>
                  <dd className="font-medium">{transfer.transfer_reason}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source Store</dt>
                  <dd className="font-medium">{srcStore?.name ?? "—"} ({srcStore?.store_code})</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source Project</dt>
                  <dd>{srcProj?.project_code} — {srcProj?.project_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Destination Store</dt>
                  <dd className="font-medium">{dstStore?.name ?? "—"} ({dstStore?.store_code})</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Destination Project</dt>
                  <dd>{dstProj?.project_code} — {dstProj?.project_name}</dd>
                </div>
                {transfer.source_approved_at && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Source Approved</dt>
                    <dd>{format(new Date(transfer.source_approved_at), "dd MMM yyyy HH:mm")} by {srcApprover?.full_name ?? "—"}</dd>
                  </div>
                )}
                {transfer.dest_approved_at && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Destination Approved</dt>
                    <dd>{format(new Date(transfer.dest_approved_at), "dd MMM yyyy HH:mm")} by {dstApprover?.full_name ?? "—"}</dd>
                  </div>
                )}
                {transfer.dispatched_at && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Dispatched</dt>
                    <dd>{format(new Date(transfer.dispatched_at), "dd MMM yyyy HH:mm")} by {dispatcher?.full_name ?? "—"}</dd>
                  </div>
                )}
                {transfer.received_at && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Received</dt>
                    <dd>{format(new Date(transfer.received_at), "dd MMM yyyy HH:mm")} by {receiver?.full_name ?? "—"}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Line Items ({transfer.inv_transfer_lines.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[650px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">UoM</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Requested</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Dispatched</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Received</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transfer.inv_transfer_lines.map(line => {
                      const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                      return (
                        <tr key={line.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <div className="font-medium text-xs">{item?.item_code ?? "—"}</div>
                            <div className="text-muted-foreground text-xs">{item?.name ?? "—"}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{item?.unit_of_measure ?? "—"}</td>
                          <td className="px-4 py-3 text-right text-xs font-medium">{line.quantity_requested}</td>
                          <td className="px-4 py-3 text-right text-xs">
                            {line.quantity_dispatched != null ? (
                              <span className="font-medium">{line.quantity_dispatched}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {line.quantity_received != null ? (
                              <span className="font-medium">{line.quantity_received}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            {line.unit_cost != null ? `$${Number(line.unit_cost).toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">History</CardTitle></CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history recorded.</p>
              ) : (
                <div className="space-y-4">
                  {auditLog.map((entry, idx) => {
                    const actor = entry.profiles as { full_name: string | null; email: string } | null
                    return (
                      <div key={entry.id} className="relative pl-6 pb-4 last:pb-0">
                        {idx < auditLog.length - 1 && (
                          <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border" />
                        )}
                        <div className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background" />
                        <div>
                          <p className="text-xs font-medium">{AUDIT_LABELS[entry.action] ?? entry.action}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {actor?.full_name ?? actor?.email ?? "System"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), "dd MMM yyyy HH:mm")}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Transfer</AlertDialogTitle>
            <AlertDialogDescription>Provide a reason for rejection.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <Label>Rejection Reason <span className="text-destructive">*</span></Label>
            <textarea
              className="mt-1.5 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[80px]"
              placeholder="Enter the reason for rejection..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={submitting || !rejectReason.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Dispatch Materials</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the quantity to dispatch from the source store for each item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Requested</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">To Dispatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfer.inv_transfer_lines.map(line => {
                  const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                  const dispatched = line.quantity_dispatched ?? 0
                  const remaining = line.quantity_requested - dispatched
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <div className="text-xs font-medium">{item?.item_code}</div>
                        <div className="text-xs text-muted-foreground">{item?.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{line.quantity_requested}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min="0" max={remaining} step="any"
                          className="h-8 text-xs text-right"
                          value={dispatchQtys[line.id] ?? "0"}
                          onChange={e => setDispatchQtys(prev => ({ ...prev, [line.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDispatch} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Dispatch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Receive Materials</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the quantity received at the destination store for each item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Dispatched</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">To Receive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transfer.inv_transfer_lines.map(line => {
                  const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                  const dispatched = line.quantity_dispatched ?? line.quantity_requested
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <div className="text-xs font-medium">{item?.item_code}</div>
                        <div className="text-xs text-muted-foreground">{item?.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{dispatched}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min="0" max={dispatched} step="any"
                          className="h-8 text-xs text-right"
                          value={receiveQtys[line.id] ?? "0"}
                          onChange={e => setReceiveQtys(prev => ({ ...prev, [line.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReceive} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Receipt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
