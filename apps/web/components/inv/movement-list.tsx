"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { History, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPES } from "./inv-types"
import type { MovementRow } from "./inv-types"

export function MovementList() {
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 25

  const [search, setSearch] = useState("")
  const [movementType, setMovementType] = useState(searchParams.get("movement_type") ?? "")
  const [itemId, setItemId] = useState(searchParams.get("item_id") ?? "")
  const [storeId, setStoreId] = useState(searchParams.get("store_id") ?? "")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      let query = supabase
        .from("inv_movements")
        .select("*, inv_items!inner(item_code, name, unit_of_measure)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1)

      if (movementType) query = query.eq("movement_type", movementType)
      if (itemId) query = query.eq("item_id", itemId)
      if (storeId) query = query.eq("store_id", storeId)
      if (search) query = query.ilike("reference_number", `%${search}%`)
      if (dateFrom) query = query.gte("movement_date", dateFrom)
      if (dateTo) query = query.lte("movement_date", dateTo)

      const { data, error: fetchErr, count } = await query
      if (fetchErr) throw fetchErr

      setRows((data ?? []) as unknown as MovementRow[])
      setTotal(count ?? 0)
    } catch (e) {
      setError((e as Error).message ?? "Failed to load movements")
    } finally {
      setLoading(false)
    }
  }, [page, movementType, itemId, storeId, search, dateFrom, dateTo])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs text-muted-foreground mb-1 block">Reference</Label>
          <Input
            placeholder="Search reference number..."
            className="h-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
            value={movementType}
            onChange={e => { setMovementType(e.target.value); setPage(1) }}
          >
            <option value="">All Types</option>
            {MOVEMENT_TYPES.map(t => (
              <option key={t} value={t}>{MOVEMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
          <Input
            type="date"
            className="h-9 w-40"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
          <Input
            type="date"
            className="h-9 w-40"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
          />
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        {(itemId || storeId) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setItemId(""); setStoreId(""); setPage(1) }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Active filter tags */}
      {(itemId || storeId) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {itemId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 border border-blue-200">
              Item: {itemId.slice(0, 8)}…
            </span>
          )}
          {storeId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 border border-blue-200">
              Store: {storeId.slice(0, 8)}…
            </span>
          )}
        </div>
      )}

      {/* Movements table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
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
            <History className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No movements recorded yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Stock movements are automatically logged when GRNs are confirmed, stock is issued, or transfers/adjustments are completed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total Cost</th>

              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const item = r.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                const isIn = r.quantity > 0
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.movement_date), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-2.5 min-w-[180px]">
                      <p className="font-medium">{item?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{item?.item_code}</p>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs font-medium">{MOVEMENT_TYPE_LABELS[r.movement_type] ?? r.movement_type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{r.reference_number}</td>
                    <td className={cn(
                      "px-4 py-2.5 text-right font-mono tabular-nums font-medium whitespace-nowrap",
                      isIn ? "text-emerald-700" : "text-red-700",
                    )}>
                      {isIn ? "+" : ""}{r.quantity.toFixed(2)} {item?.unit_of_measure}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      {r.unit_cost.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      {r.total_cost.toFixed(2)}
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
