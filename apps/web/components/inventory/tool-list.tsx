"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Wrench, Plus, Lock, ChevronRight } from "lucide-react"
import { InvStatusBadge } from "./inv-status-badge"
import type { ToolRow } from "./inv-types"
import { ToolForm } from "./tool-form"
import { listInvToolIssuesWithStatusIssuedOverdue, listInvTools } from "@/lib/inventory/inventory-queries";

interface ActiveIssue {
  tool_id: string
  status: string
  profiles: { full_name: string | null; email: string } | null
}

export function ToolList() {
  const router = useRouter()

  const [rows, setRows] = useState<ToolRow[]>([])
  const [custodians, setCustodians] = useState<Record<string, ActiveIssue>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [editingTool, setEditingTool] = useState<ToolRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {

      let query = listInvTools()
      if (status) query = query.eq("status", status)
      if (search) query = query.or(`tool_code.ilike.%${search}%,name.ilike.%${search}%,serial_no.ilike.%${search}%`)

      const { data, error: fetchErr } = await query
      if (fetchErr) throw fetchErr
      const tools = (data ?? []) as ToolRow[]
      setRows(tools)

      const { data: issues } = await listInvToolIssuesWithStatusIssuedOverdue("tool_id, status, profiles!custodian_id(full_name, email)")
      const map: Record<string, ActiveIssue> = {}
      for (const i of (issues ?? []) as unknown as ActiveIssue[]) map[i.tool_id] = i
      setCustodians(map)
    } catch (e) {
      setError((e as Error).message ?? "Failed to load tools")
    } finally {
      setLoading(false)
    }
  }, [status, search])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditingTool(null)
    setFormOpen(true)
  }

  function openEdit(e: React.MouseEvent, tool: ToolRow) {
    e.stopPropagation()
    setEditingTool(tool)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search code, name, or serial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="issued">Issued</option>
          <option value="maintenance">Maintenance</option>
          <option value="lost">Lost</option>
          <option value="disposed">Disposed</option>
        </select>

        <Button className="ml-auto" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />New Tool
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Wrench className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No tools found.</p>
            <p className="mt-1 text-sm text-muted-foreground">Click &apos;New Tool&apos; to register a serialized returnable tool.</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />New Tool
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Serial</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Custodian</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((tool) => {
                const custody = custodians[tool.id]
                return (
                  <tr
                    key={tool.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/inventory/tools/${tool.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      <div className="flex items-center gap-1.5">
                        {tool.tool_code}
                        {tool.is_restricted && <Lock className="h-3 w-3 text-amber-600" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{tool.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tool.serial_no ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tool.category ?? "—"}</td>
                    <td className="px-4 py-3"><InvStatusBadge status={tool.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {custody ? (custody.profiles?.full_name ?? custody.profiles?.email ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => openEdit(e, tool)}>
                          Edit
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {rows.length} tool{rows.length !== 1 ? "s" : ""}
          {" · "}{rows.filter(t => t.is_restricted).length} restricted
        </p>
      )}

      {formOpen && (
        <ToolForm
          tool={editingTool}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={load}
        />
      )}
    </div>
  )
}
