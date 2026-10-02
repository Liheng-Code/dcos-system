"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Plus, Undo2, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { InvStatusBadge } from "./inv-status-badge"
import type { ReturnRow, InvStore } from "./inv-types"
import { listInvReturns, listInvStoresWithStatusActive } from "@/lib/inventory/inventory-queries";

export function ReturnList() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<ReturnRow[]>([])
  const [stores, setStores] = useState<InvStore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState(searchParams.get("status") ?? "")
  const [storeId, setStoreId] = useState(searchParams.get("store_id") ?? "")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {

      if (stores.length === 0) {
        // Note: inv_stores has a `status` column ('active'/'closed'), not `is_active`.
        const { data: storeData } = await listInvStoresWithStatusActive("id, store_code, name, project_id, status")
        setStores((storeData ?? []) as InvStore[])
      }

      let query = listInvReturns()

      if (status) query = query.eq("status", status)
      if (storeId) query = query.eq("store_id", storeId)
      if (search) query = query.ilike("return_number", `%${search}%`)

      const { data, error: fetchErr } = await query
      if (fetchErr) throw fetchErr
      setRows((data ?? []) as unknown as ReturnRow[])
    } catch (e) {
      setError((e as Error).message ?? "Failed to load returns")
    } finally {
      setLoading(false)
    }
  }, [status, storeId, search, stores.length])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search return number..."
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
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="inspected">Inspected</option>
          <option value="posted">Posted</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">All Stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <Button className="ml-auto" onClick={() => router.push("/dashboard/inventory/returns/new")}>
          <Plus className="mr-2 h-4 w-4" />New Return
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
            <Undo2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No returns found.</p>
            <p className="mt-1 text-sm text-muted-foreground">Click &apos;New Return&apos; to return surplus or damaged material to store.</p>
            <Button className="mt-4" onClick={() => router.push("/dashboard/inventory/returns/new")}>
              <Plus className="mr-2 h-4 w-4" />New Return
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Return No.</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Store</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Return Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Lines</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const store = row.inv_stores as { name: string; store_code: string } | null | undefined
                const lineCount = (row.inv_return_lines as { count: number }[] | undefined)?.[0]?.count ?? 0
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/inventory/returns/${row.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{row.return_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{store ? `${store.name} (${store.store_code})` : "—"}</td>
                    <td className="px-4 py-3 text-sm">{format(new Date(row.return_date), "dd MMM yyyy")}</td>
                    <td className="px-4 py-3 text-right text-xs">{lineCount}</td>
                    <td className="px-4 py-3"><InvStatusBadge status={row.status} /></td>
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
    </div>
  )
}
