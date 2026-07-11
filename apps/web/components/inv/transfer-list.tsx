"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Plus, ArrowLeftRight, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import type { TransferRow } from "./inv-types"

export function TransferList() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<TransferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 25

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(searchParams.get("status") ?? "")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      let query = supabase
        .from("inv_transfers")
        .select("*, source_store:source_store_id(name, store_code), destination_store:destination_store_id(name, store_code), source_project:source_project_id(project_name, project_code), destination_project:destination_project_id(project_name, project_code)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1)

      if (status) query = query.eq("status", status)
      if (search) query = query.ilike("transfer_number", `%${search}%`)

      const { data, error: fetchErr, count } = await query
      if (fetchErr) throw fetchErr

      setRows((data ?? []) as unknown as TransferRow[])
      setTotal(count ?? 0)
    } catch (e) {
      setError((e as Error).message ?? "Failed to load transfers")
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search transfer number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="in_transit">In Transit</option>
          <option value="received">Received</option>
          <option value="discrepancy">Discrepancy</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <Button className="ml-auto" onClick={() => router.push("/dashboard/inventory/transfers/new")}>
          <Plus className="mr-2 h-4 w-4" />New Transfer
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
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
            <ArrowLeftRight className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No transfers found.</p>
            <p className="mt-1 text-sm text-muted-foreground">Click &apos;New Transfer&apos; to move stock between stores.</p>
            <Button className="mt-4" onClick={() => router.push("/dashboard/inventory/transfers/new")}>
              <Plus className="mr-2 h-4 w-4" />New Transfer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Transfer #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Destination</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Reason</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const srcStore = row.source_store as { name: string; store_code: string } | undefined
                const dstStore = row.destination_store as { name: string; store_code: string } | undefined
                const srcProj = row.source_project as { project_name: string; project_code: string } | undefined
                const dstProj = row.destination_project as { project_name: string; project_code: string } | undefined

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/inventory/transfers/${row.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{row.transfer_number}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="capitalize">{row.transfer_type === "intra_project" ? "Intra-Project" : "Inter-Project"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium">{srcStore?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{srcProj?.project_code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium">{dstStore?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{dstProj?.project_code}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">{row.transfer_reason}</td>
                    <td className="px-4 py-3"><InvStatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(row.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
