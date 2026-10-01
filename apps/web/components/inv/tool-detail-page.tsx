"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
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
import { ArrowLeft, Pencil, PackageCheck, PackageMinus, Loader2, Lock, History } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import { TOOL_CONDITION_LABELS } from "./inv-types"
import type { ToolRow, ToolIssueRow } from "./inv-types"
import { ToolForm } from "./tool-form"
import { ToolIssueForm } from "./tool-issue-form"
import { LabelPrintButton } from "./label-print-button"
import { getInvToolById, listInvToolIssuesByToolId } from "@/lib/inv/inventory-queries";

export function ToolDetailPage({ id }: { id: string }) {
  const router = useRouter()

  const [tool, setTool] = useState<ToolRow | null>(null)
  const [history, setHistory] = useState<ToolIssueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [conditionIn, setConditionIn] = useState<"good" | "damaged" | "lost">("good")
  const [returning, setReturning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: toolData, error: toolErr } = await getInvToolById(id)
      if (toolErr || !toolData) throw new Error("Tool not found")
      setTool(toolData as ToolRow)

      const { data: historyData } = await listInvToolIssuesByToolId(id)
      setHistory((historyData ?? []) as unknown as ToolIssueRow[])
    } catch (e) {
      setError((e as Error).message ?? "Failed to load tool")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleReturn() {
    setReturning(true)
    try {
      const res = await fetch(`/api/inv/tools/${id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition_in: conditionIn }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Return failed")
      toast.success("Tool returned")
      setReturnOpen(false)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setReturning(false)
    }
  }

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (error || !tool) return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground mb-3">{error ?? "Tool not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/inventory/tools")}>Back to list</Button>
        </CardContent>
      </Card>
    </div>
  )

  const canIssue = tool.status === "available"
  const canReturn = ["issued", "overdue"].includes(tool.status)

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/tools")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold font-mono">{tool.tool_code}</h1>
              <InvStatusBadge status={tool.status} />
              {tool.is_restricted && (
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50 gap-1">
                  <Lock className="h-3 w-3" />Restricted
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{tool.name}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <LabelPrintButton type="tool" id={tool.id} />
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />Edit
          </Button>
          {canIssue && (
            <Button onClick={() => setIssueOpen(true)}>
              <PackageCheck className="mr-2 h-4 w-4" />Issue
            </Button>
          )}
          {canReturn && (
            <Button onClick={() => setReturnOpen(true)}>
              <PackageMinus className="mr-2 h-4 w-4" />Return
            </Button>
          )}
        </div>
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tool Details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Serial No.</dt>
              <dd className="font-medium">{tool.serial_no ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd>{tool.category ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Purchase Value</dt>
              <dd>{tool.purchase_value != null ? Number(tool.purchase_value).toFixed(2) : "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Custody history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Custody Register ({history.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">This tool has never been issued.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[750px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Custodian</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Project / WBS</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Issued</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Due</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Returned</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Condition In</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map(h => {
                    const custodian = h.profiles as { full_name: string | null; email: string } | undefined
                    const project = h.projects as { project_code: string; project_name: string } | undefined
                    const wbs = h.wbs_nodes as { wbs_code: string; wbs_name: string } | undefined
                    return (
                      <tr key={h.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 text-xs font-medium">{custodian?.full_name ?? custodian?.email ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {project ? project.project_code : "—"}{wbs ? ` / ${wbs.wbs_code}` : ""}
                        </td>
                        <td className="px-4 py-3 text-xs">{format(new Date(h.issued_at), "dd MMM yyyy")}</td>
                        <td className="px-4 py-3 text-xs">{format(new Date(h.due_date), "dd MMM yyyy")}</td>
                        <td className="px-4 py-3 text-xs">{h.returned_at ? format(new Date(h.returned_at), "dd MMM yyyy") : "—"}</td>
                        <td className="px-4 py-3 text-xs">{h.condition_in ? (TOOL_CONDITION_LABELS[h.condition_in] ?? h.condition_in) : "—"}</td>
                        <td className="px-4 py-3"><InvStatusBadge status={h.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editOpen && (
        <ToolForm tool={tool} open={editOpen} onOpenChange={setEditOpen} onSaved={load} />
      )}

      {issueOpen && (
        <ToolIssueForm
          toolId={tool.id}
          toolCode={tool.tool_code}
          open={issueOpen}
          onOpenChange={setIssueOpen}
          onIssued={load}
        />
      )}

      <AlertDialog open={returnOpen} onOpenChange={setReturnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return {tool.tool_code}</AlertDialogTitle>
            <AlertDialogDescription>
              Record the condition of the tool as it is returned to store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <label className="text-sm font-medium">Condition In</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={conditionIn}
              onChange={e => setConditionIn(e.target.value as typeof conditionIn)}
            >
              {Object.entries(TOOL_CONDITION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={returning}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReturn} disabled={returning}>
              {returning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
