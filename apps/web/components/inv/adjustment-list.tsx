"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Plus, RefreshCw, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import { REASON_CODE_LABELS } from "./inv-types"
import type { AdjustmentRow } from "./inv-types"

export function AdjustmentList() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<AdjustmentRow[]>([])
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
        .from("inv_adjustments")
        .select("*, inv_adjustment_lines(count)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1)

      if (status) query = query.eq("status", status)
      if (search) query = query.ilike("adjustment_number", `%${search}%`)

      const { data, error: fetchErr, count } = await query
      if (fetchErr) throw fetchErr

      setRows((data ?? []) as unknown as AdjustmentRow[])
      setTotal(count ?? 0)
    } catch (e) {
      setError((e as Error).message ?? "Failed to load adjustments")
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by adjustment number..."
            className="pl-8"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">All Statuses</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <Button variant="outline" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={() => router.push("/dashboard/inventory/adjustments/new")}>
          <Plus className="mr-2 h-4 w-4" />New Adjustment
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-3" onClick={load}>Retry</Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <RefreshCw className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No adjustments found.</p>
            <p className="mt-1 text-sm text-muted-foreground">Click &apos;New Adjustment&apos; to record a stock correction.</p>
            <Button className="mt-4" onClick={() => router.push("/dashboard/inventory/adjustments/new")}>
              <Plus className="mr-2 h-4 w-4" />New Adjustment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Adjustment #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Reason</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Lines</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/inventory/adjustments/${r.id}`)}
                >
                  <td className="px-4 py-2.5 font-medium">{r.adjustment_number}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{REASON_CODE_LABELS[r.reason_code] ?? r.reason_code}</td>
                  <td className="px-4 py-2.5"><InvStatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.inv_adjustment_lines?.[0]?.count ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "dd MMM yyyy")}
                  </td>
                  <td className="px-4 py-2.5"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
