"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Plus, ClipboardList, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import type { MrRow, InvStore } from "./inv-types"

export function MrList() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<MrRow[]>([])
  const [stores, setStores] = useState<InvStore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 25

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(searchParams.get("status") ?? "")
  const [storeId, setStoreId] = useState(searchParams.get("store_id") ?? "")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      if (stores.length === 0) {
        const { data: storeData } = await supabase
          .from("inv_stores")
          .select("id, store_code, name, project_id, is_active")
          .eq("is_active", true)
          .order("name")
        setStores((storeData ?? []) as InvStore[])
      }

      let query = supabase
        .from("inv_material_requisitions")
        .select("*, profiles!requested_by(full_name, email)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1)

      if (status) query = query.eq("status", status)
      if (storeId) query = query.eq("store_id", storeId)
      if (search) query = query.ilike("mr_number", `%${search}%`)

      const { data, error: fetchErr, count } = await query
      if (fetchErr) throw fetchErr

      setRows((data ?? []) as unknown as MrRow[])
      setTotal(count ?? 0)
    } catch (e) {
      setError((e as Error).message ?? "Failed to load MRs")
    } finally {
      setLoading(false)
    }
  }, [page, status, storeId, search, stores.length])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)

  function isOverdue(row: MrRow) {
    return (
      ["draft", "submitted"].includes(row.status) &&
      new Date(row.required_date) < new Date()
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search MR number..."
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
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="partially_issued">Partially Issued</option>
          <option value="issued">Issued</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={storeId}
          onChange={(e) => { setStoreId(e.target.value); setPage(1) }}
        >
          <option value="">All Stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <Button className="ml-auto" onClick={() => router.push("/dashboard/inventory/mrs/new")}>
          <Plus className="mr-2 h-4 w-4" />New MR
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
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No material requisitions yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Click 'New MR' to request materials for a task.</p>
            <Button className="mt-4" onClick={() => router.push("/dashboard/inventory/mrs/new")}>
              <Plus className="mr-2 h-4 w-4" />New MR
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">MR Number</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Cost Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Required Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Requested By</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const requester = row.profiles as { full_name: string | null; email: string } | undefined
                const overdue = isOverdue(row)

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/inventory/mrs/${row.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{row.mr_number}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{row.cost_code}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={overdue ? "text-red-700 font-semibold" : ""}>
                        {format(new Date(row.required_date), "dd MMM yyyy")}
                      </span>
                      {overdue && <span className="ml-1 text-xs text-red-600">(overdue)</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {requester?.full_name ?? requester?.email ?? "—"}
                    </td>
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

      {/* Pagination */}
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
