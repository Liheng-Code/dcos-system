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
  Package, AlertTriangle,
} from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import type { MrRow, MrLineRow } from "./inv-types"

interface AuditEntry {
  id: string
  action: string
  performed_by: string
  created_at: string
  old_status: string | null
  new_status: string | null
  details: Record<string, unknown> | null
  profiles?: { full_name: string | null; email: string } | null
}

interface MrDetailData extends MrRow {
  mr_number: string
  store_id: string
  wbs_node_id: string
  task_id: string | null
  cost_code: string
  required_date: string
  requested_by: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  inv_mr_lines: MrLineRow[]
  wbs_nodes?: { wbs_code: string; wbs_name: string; full_path: string | null } | null
  inv_stores?: { name: string; store_code: string } | null
  profiles?: { full_name: string | null; email: string } | null
  approver?: { full_name: string | null; email: string } | null
}

const MR_ACTION_LABELS: Record<string, string> = {
  mr_created: "Created",
  mr_submitted: "Submitted",
  mr_approved: "Approved",
  mr_rejected: "Rejected",
  mr_issued: "Issued",
  mr_partially_issued: "Partially Issued",
}

export function MrDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [mr, setMr] = useState<MrDetailData | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showIssueDialog, setShowIssueDialog] = useState(false)
  const [issueQtys, setIssueQtys] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: mrData, error: mrErr } = await supabase
          .from("inv_material_requisitions")
          .select(`
            *,
            inv_mr_lines(
              id, item_id, quantity_requested, quantity_approved, quantity_issued,
              unit_cost_at_issue, remarks,
              inv_items(item_code, name, unit_of_measure)
            ),
            wbs_nodes!wbs_node_id(wbs_code, wbs_name, full_path),
            inv_stores!store_id(name, store_code),
            profiles!requested_by(full_name, email),
            approver:profiles!approved_by(full_name, email)
          `)
          .eq("id", id)
          .single()

        if (cancelled) return
        if (mrErr || !mrData) { setError("MR not found"); setLoading(false); return }

        setMr(mrData as unknown as MrDetailData)

        const qtyMap: Record<string, string> = {}
        const lines = (mrData as unknown as MrDetailData).inv_mr_lines ?? []
        for (const line of lines) {
          const approved = line.quantity_approved ?? line.quantity_requested
          qtyMap[line.id] = String(approved - line.quantity_issued)
        }
        setIssueQtys(qtyMap)

        const { data: auditData } = await supabase
          .from("inv_audit_log")
          .select("*, profiles!performed_by(full_name, email)")
          .eq("table_name", "inv_material_requisitions")
          .eq("record_id", id)
          .order("created_at", { ascending: true })

        if (cancelled) return
        setAuditLog((auditData ?? []) as AuditEntry[])
      } catch {
        if (!cancelled) setError("Failed to load MR details")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, supabase])

  function updateIssueQty(lineId: string, val: string) {
    setIssueQtys(prev => ({ ...prev, [lineId]: val }))
  }

  async function handleApprove() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/mrs/${id}/approve`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Approval failed")
      toast.success("MR approved")
      setShowApproveDialog(false)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { toast.error("Enter a rejection reason"); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/mrs/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: rejectReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Rejection failed")
      toast.success("MR rejected")
      setShowRejectDialog(false)
      setRejectReason("")
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleIssue() {
    const lines = mr?.inv_mr_lines ?? []
    const issueLines = lines
      .map(l => ({
        mr_line_id: l.id,
        quantity_issued: parseFloat(issueQtys[l.id] ?? "0"),
      }))
      .filter(l => l.quantity_issued > 0)

    if (issueLines.length === 0) { toast.error("Enter at least one issue quantity"); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/inv/mrs/${id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: issueLines }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Issue failed")
      toast.success("Materials issued")
      setShowIssueDialog(false)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
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

  if (error || !mr) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground mb-3">{error ?? "MR not found"}</p>
            <Button variant="outline" onClick={() => router.push("/dashboard/inventory/mrs")}>
              Back to list
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const requester = mr.profiles as { full_name: string | null; email: string } | undefined
  const approverInfo = mr.approver as { full_name: string | null; email: string } | undefined
  const storeInfo = mr.inv_stores as { name: string; store_code: string } | undefined
  const wbsInfo = mr.wbs_nodes as { wbs_code: string; wbs_name: string; full_path: string | null } | undefined

  const isOverdue = ["draft", "submitted"].includes(mr.status) && new Date(mr.required_date) < new Date()

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/mrs")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold font-mono">{mr.mr_number}</h1>
              <InvStatusBadge status={mr.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Requested by {requester?.full_name ?? requester?.email ?? "—"} &middot;{" "}
              {format(new Date(mr.created_at), "dd MMM yyyy")}
            </p>
          </div>
        </div>

        {/* Approval action bar */}
        {mr.status === "submitted" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(true)}>
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button onClick={() => setShowApproveDialog(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </div>
        )}

        {/* Issue action bar */}
        {(mr.status === "approved" || mr.status === "partially_issued") && (
          <Button onClick={() => setShowIssueDialog(true)}>
            <Package className="mr-2 h-4 w-4" />
            Issue Materials
          </Button>
        )}
      </div>

      {/* Overdue warning */}
      {isOverdue && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Required date ({format(new Date(mr.required_date), "dd MMM yyyy")}) has passed — MR is overdue.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: MR header details */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Requisition Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Store</dt>
                  <dd className="font-medium">{storeInfo?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">WBS Node</dt>
                  <dd className="font-medium">{wbsInfo?.wbs_code ? `${wbsInfo.wbs_code} — ${wbsInfo.wbs_name}` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Task</dt>
                  <dd>{mr.task_id ? "Assigned" : "No specific task"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cost Code</dt>
                  <dd className="font-mono text-xs">{mr.cost_code}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Required Date</dt>
                  <dd className={isOverdue ? "text-red-700 font-semibold" : ""}>
                    {format(new Date(mr.required_date), "dd MMM yyyy")}
                    {isOverdue && <span className="ml-1 text-xs text-red-600">(overdue)</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Requested By</dt>
                  <dd>{requester?.full_name ?? requester?.email ?? "—"}</dd>
                </div>
                {mr.approved_at && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Approved At</dt>
                    <dd>{format(new Date(mr.approved_at), "dd MMM yyyy HH:mm")}</dd>
                  </div>
                )}
                {mr.approved_by && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Approved By</dt>
                    <dd>{approverInfo?.full_name ?? approverInfo?.email ?? "—"}</dd>
                  </div>
                )}
                {mr.rejection_reason && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Rejection Reason</dt>
                    <dd className="text-red-700">{mr.rejection_reason}</dd>
                  </div>
                )}
                {mr.remarks && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Remarks</dt>
                    <dd className="text-muted-foreground">{mr.remarks}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Line Items ({mr.inv_mr_lines.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {mr.inv_mr_lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No line items.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[650px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">UoM</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Requested</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Approved</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Issued</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {mr.inv_mr_lines.map(line => {
                        const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                        const approved = line.quantity_approved ?? line.quantity_requested
                        const remaining = approved - line.quantity_issued
                        return (
                          <tr key={line.id} className="hover:bg-muted/20">
                            <td className="px-4 py-3">
                              <div className="font-medium text-xs">{item?.item_code ?? "—"}</div>
                              <div className="text-muted-foreground text-xs">{item?.name ?? "—"}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{item?.unit_of_measure ?? "—"}</td>
                            <td className="px-4 py-3 text-right text-xs font-medium">{line.quantity_requested}</td>
                            <td className="px-4 py-3 text-right text-xs">
                              {line.quantity_approved != null ? (
                                <span className="font-medium">{line.quantity_approved}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-xs">
                              {line.quantity_issued > 0 ? (
                                <span className="font-medium">{line.quantity_issued}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {remaining > 0 && line.quantity_issued > 0 && (
                                <div className="text-xs text-amber-700">({remaining} remaining)</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{line.remarks || "—"}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Approval history timeline */}
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
                          <p className="text-xs font-medium">
                            {MR_ACTION_LABELS[entry.action] ?? entry.action}
                          </p>
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

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve MR?</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve all requested quantities. Stock will be reserved for issue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject MR</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for rejection. The requester will be notified.
            </AlertDialogDescription>
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
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Issue Dialog */}
      <AlertDialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Issue Materials</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the quantity to issue for each line item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Approved</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Issued</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-28">To Issue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mr.inv_mr_lines.map(line => {
                  const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                  const approved = line.quantity_approved ?? line.quantity_requested
                  const remaining = approved - line.quantity_issued
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <div className="text-xs font-medium">{item?.item_code}</div>
                        <div className="text-xs text-muted-foreground">{item?.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{approved}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{line.quantity_issued}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          step="any"
                          className="h-8 text-xs text-right"
                          value={issueQtys[line.id] ?? "0"}
                          onChange={e => updateIssueQty(line.id, e.target.value)}
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
            <AlertDialogAction onClick={handleIssue} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
