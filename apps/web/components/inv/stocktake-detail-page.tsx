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
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, PlayCircle, CheckCircle2, XCircle, SendHorizontal, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import type { StocktakeRow, StocktakeLineRow } from "./inv-types"
import { getInvStocktakeById, listInvStocktakeLinesByStocktakeId } from "@/lib/inv/inventory-queries";

interface Props {
  id: string
}

export function StocktakeDetailPage({ id }: Props) {
  const router = useRouter()
  const [st, setSt] = useState<StocktakeRow | null>(null)
  const [lines, setLines] = useState<StocktakeLineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([
      getInvStocktakeById(id),
      listInvStocktakeLinesByStocktakeId(id),
    ]).then(([stRes, linesRes]) => {
      if (stRes.error || !stRes.data) { setError("Stocktake not found"); return }
      setSt(stRes.data as unknown as StocktakeRow)
      setLines(linesRes.data as unknown as StocktakeLineRow[])
    }).catch(e => setError((e as Error).message))
    .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  function updateLocalCount(lineId: string, val: string) {
    const num = parseFloat(val)
    if (isNaN(num)) return
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l
      const variance = +(num - l.system_quantity).toFixed(4)
      const variancePercent = l.system_quantity !== 0 ? +((variance / l.system_quantity) * 100).toFixed(4) : 0
      const varianceValue = l.unit_cost ? +(variance * l.unit_cost).toFixed(2) : null
      return {
        ...l,
        counted_quantity: num,
        variance,
        variance_percent: variancePercent,
        variance_value: varianceValue,
      }
    }))
  }

  async function handleStartCounting() {
    setActing(true)
    try {
      const res = await fetch(`/api/inv/stocktakes/${id}/start`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to start counting")
      toast.success("Stocktake started — enter counts below")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  async function handleSaveCount(lineId: string) {
    const line = lines.find(l => l.id === lineId)
    if (!line || line.counted_quantity == null) return
    setActing(true)
    try {
      const res = await fetch(`/api/inv/stocktakes/${id}/lines`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_id: lineId,
          counted_quantity: line.counted_quantity,
          explanation: line.explanation,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save count")
      toast.success("Count saved")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  async function handleSubmitForApproval() {
    setActing(true)
    try {
      const res = await fetch(`/api/inv/stocktakes/${id}/submit`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to submit")
      toast.success("Submitted for approval")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  async function handleApproveLine(lineId: string) {
    setActing(true)
    try {
      const res = await fetch(`/api/inv/stocktakes/${id}/lines/${lineId}/approve`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to approve line")
      toast.success("Line approved")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  async function handleComplete() {
    setActing(true)
    try {
      const res = await fetch(`/api/inv/stocktakes/${id}/complete`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to complete stocktake")
      toast.success("Stocktake completed — adjustments posted")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  async function handleCancel() {
    setActing(true)
    try {
      const res = await fetch(`/api/inv/stocktakes/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to cancel")
      toast.success("Stocktake cancelled")
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
      setShowCancel(false)
    }
  }

  const profile = st?.profiles as { full_name: string | null; email: string } | null
  const countedLines = lines.filter(l => l.counted_quantity != null)


  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (error || !st) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-destructive font-medium">{error ?? "Stocktake not found"}</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{st.stocktake_number}</h1>
            <InvStatusBadge status={st.status} />
            {["open", "counting"].includes(st.status) && (
              <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Store Locked</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Initiated by {profile?.full_name ?? profile?.email ?? "—"} on {format(new Date(st.initiated_at), "dd MMM yyyy HH:mm")}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Items</p>
            <p className="mt-0.5 text-xl font-semibold">{lines.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Counted</p>
            <p className="mt-0.5 text-xl font-semibold">{countedLines.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">With Variance</p>
            <p className="mt-0.5 text-xl font-semibold">{lines.filter(l => Math.abs(l.variance ?? 0) > 0.0001).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Variance Value</p>
            <p className={[
              "mt-0.5 text-xl font-semibold",
              (st.total_variance_value ?? 0) > 0 ? "text-red-700" : "text-emerald-700",
            ].join(" ")}>
              {(st.total_variance_value ?? 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {st.notes && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{st.notes}</p></CardContent>
        </Card>
      )}

      {/* Lines (items table) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">System Qty</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Counted Qty</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Variance</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Var %</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Status</th>
                  {st.status === "counting" && <th className="w-24" />}
                  {st.status === "pending_approval" && <th className="w-24" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map(l => {
                  const item = l.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                  const hasVariance = Math.abs(l.variance ?? 0) > 0.0001
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{item?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{item?.item_code} / {item?.unit_of_measure}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{l.system_quantity.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {st.status === "counting" ? (
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="h-8 w-24 text-right ml-auto"
                            value={l.counted_quantity ?? ""}
                            placeholder="—"
                            onChange={e => updateLocalCount(l.id, e.target.value)}
                          />
                        ) : (
                          l.counted_quantity?.toFixed(2) ?? "—"
                        )}
                      </td>
                      <td className={[
                        "px-4 py-2.5 text-right font-mono tabular-nums font-medium",
                        hasVariance ? (l.variance! > 0 ? "text-emerald-700" : "text-red-700") : "",
                      ].join(" ")}>
                        {l.variance != null ? (l.variance > 0 ? "+" : "") + l.variance.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {l.variance_percent != null ? `${l.variance_percent.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {l.is_approved ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Approved</Badge>
                        ) : l.counted_quantity != null ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Counted</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">Pending</Badge>
                        )}
                      </td>
                      {st.status === "counting" && (
                        <td className="px-3 py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={l.counted_quantity == null || acting}
                            onClick={() => handleSaveCount(l.id)}
                          >
                            {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                          </Button>
                        </td>
                      )}
                      {st.status === "pending_approval" && hasVariance && !l.is_approved && (
                        <td className="px-3 py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting}
                            onClick={() => handleApproveLine(l.id)}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />Approve
                          </Button>
                        </td>
                      )}
                      {st.status === "pending_approval" && (!hasVariance || l.is_approved) && (
                        <td className="px-3 py-2" />
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-between">
        <div>
          {!["completed", "cancelled"].includes(st.status) && (
            <Button variant="outline" className="text-destructive border-destructive/30" onClick={() => setShowCancel(true)} disabled={acting}>
              <XCircle className="mr-2 h-4 w-4" />Cancel Stocktake
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          {st.status === "open" && (
            <Button onClick={handleStartCounting} disabled={acting}>
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <PlayCircle className="mr-2 h-4 w-4" />Start Counting
            </Button>
          )}
          {st.status === "counting" && countedLines.length > 0 && (
            <Button onClick={handleSubmitForApproval} disabled={acting}>
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <SendHorizontal className="mr-2 h-4 w-4" />Submit for Approval
            </Button>
          )}
          {st.status === "pending_approval" && (
            <Button onClick={handleComplete} disabled={acting}>
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" />Complete & Reconcile
            </Button>
          )}
        </div>
      </div>

      {/* Cancel dialog */}
      <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Stocktake</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this stocktake? All count data will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Input
              placeholder="e.g. Store not ready, need to reschedule"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelReason("")}>Keep Stocktake</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleCancel} disabled={acting}>
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Stocktake
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
