"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { ArrowLeft, ClipboardCheck, CheckCircle2, Loader2, Package } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import { RETURN_CONDITION_LABELS } from "./inv-types"
import type { ReturnRow, ReturnLineRow } from "./inv-types"
import { getInvReturnById } from "@/lib/inv/inventory-queries";

interface ReturnDetail extends ReturnRow {
  inv_return_lines: ReturnLineRow[]
  inv_stores?: { name: string; store_code: string } | null
  profiles?: { full_name: string | null; email: string } | null
}

const CONDITION_CLASSES: Record<string, string> = {
  good: "border-emerald-300 text-emerald-700 bg-emerald-50",
  damaged: "border-amber-300 text-amber-700 bg-amber-50",
  scrap: "border-red-300 text-red-700 bg-red-50",
}

export function ReturnDetailPage({ id }: { id: string }) {
  const router = useRouter()

  const [ret, setRet] = useState<ReturnDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const [showInspect, setShowInspect] = useState(false)
  const [inspectLines, setInspectLines] = useState<Record<string, { condition: string; unit_cost: string; remarks: string }>>({})
  const [showPost, setShowPost] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await getInvReturnById(id)
    if (e || !data) {
      setError("Return not found")
    } else {
      const detail = data as unknown as ReturnDetail
      setRet(detail)
      const map: Record<string, { condition: string; unit_cost: string; remarks: string }> = {}
      for (const l of detail.inv_return_lines ?? []) {
        map[l.id] = {
          condition: l.condition,
          unit_cost: l.unit_cost != null ? String(l.unit_cost) : "",
          remarks: l.remarks ?? "",
        }
      }
      setInspectLines(map)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  function updateInspectLine(lineId: string, field: "condition" | "unit_cost" | "remarks", value: string) {
    setInspectLines(prev => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }))
  }

  async function handleInspect() {
    if (!ret) return
    setActing(true)
    try {
      const res = await fetch(`/api/inv/returns/${id}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: ret.inv_return_lines.map(l => ({
            return_line_id: l.id,
            condition: inspectLines[l.id]?.condition ?? l.condition,
            // API expects a decimal string (e.g. "12.50"), not a native float — see inv-schemas.ts decimalMoneyString.
            unit_cost: inspectLines[l.id]?.unit_cost !== "" ? parseFloat(inspectLines[l.id].unit_cost).toFixed(2) : null,
            remarks: inspectLines[l.id]?.remarks || null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Inspection failed")
      toast.success("Return inspected")
      setShowInspect(false)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  async function handlePost() {
    setActing(true)
    try {
      const res = await fetch(`/api/inv/returns/${id}/post`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Post failed")
      toast.success("Return posted — good-condition stock updated")
      setShowPost(false)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(false)
    }
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (error || !ret) return (
    <div className="max-w-5xl mx-auto">
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground mb-3">{error ?? "Return not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/inventory/returns")}>Back to list</Button>
        </CardContent>
      </Card>
    </div>
  )

  const requester = ret.profiles as { full_name: string | null; email: string } | undefined
  const storeInfo = ret.inv_stores as { name: string; store_code: string } | undefined
  const canInspect = ["draft", "submitted"].includes(ret.status)
  const canPost = ret.status === "inspected"

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/returns")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold font-mono">{ret.return_number}</h1>
              <InvStatusBadge status={ret.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {storeInfo?.name ?? "—"} &middot; Returned {format(new Date(ret.return_date), "dd MMM yyyy")}
              {requester && <> &middot; by {requester.full_name ?? requester.email}</>}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {canInspect && (
            <Button onClick={() => setShowInspect(true)}>
              <ClipboardCheck className="mr-2 h-4 w-4" />Inspect
            </Button>
          )}
          {canPost && (
            <Button onClick={() => setShowPost(true)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />Post to Stock
            </Button>
          )}
        </div>
      </div>

      {ret.status === "posted" && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Return posted — good-condition quantities have been added back to available stock.
        </div>
      )}

      {/* Lines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Line Items ({ret.inv_return_lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ret.inv_return_lines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No line items.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[650px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Quantity</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Condition</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ret.inv_return_lines.map(line => {
                    const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                    return (
                      <tr key={line.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium text-xs">{item?.item_code ?? "—"}</div>
                          <div className="text-muted-foreground text-xs">{item?.name ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">{line.quantity} {item?.unit_of_measure}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${CONDITION_CLASSES[line.condition] ?? ""}`}>
                            {RETURN_CONDITION_LABELS[line.condition] ?? line.condition}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">{line.unit_cost != null ? Number(line.unit_cost).toFixed(2) : "—"}</td>
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

      {/* Inspect dialog */}
      <AlertDialog open={showInspect} onOpenChange={setShowInspect}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Inspect Return</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm or adjust the condition and unit cost for each line before posting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-32">Condition</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-24">Unit Cost</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ret.inv_return_lines.map(line => {
                  const item = line.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                  const state = inspectLines[line.id] ?? { condition: line.condition, unit_cost: "", remarks: "" }
                  return (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <div className="text-xs font-medium">{item?.item_code}</div>
                        <div className="text-xs text-muted-foreground">{item?.name} · Qty {line.quantity}</div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="flex h-8 w-full rounded border border-input bg-transparent px-2 text-xs"
                          value={state.condition}
                          onChange={e => updateInspectLine(line.id, "condition", e.target.value)}
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
                          value={state.unit_cost}
                          onChange={e => updateInspectLine(line.id, "unit_cost", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-8 text-xs"
                          value={state.remarks}
                          onChange={e => updateInspectLine(line.id, "remarks", e.target.value)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleInspect} disabled={acting}>
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Inspection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post dialog */}
      <AlertDialog open={showPost} onOpenChange={setShowPost}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post Return to Stock?</AlertDialogTitle>
            <AlertDialogDescription>
              Good-condition lines will be added back to available stock. Damaged/scrap lines are recorded but
              excluded from available stock. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePost} disabled={acting}>
              {acting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
