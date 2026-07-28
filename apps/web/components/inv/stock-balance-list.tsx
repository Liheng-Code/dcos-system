"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Package, Plus, BarChart2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import type { StockRow, InvStore } from "./inv-types"
import { CATEGORIES } from "./inv-types"

export function StockBalanceList() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [rows, setRows] = useState<StockRow[]>([])
  const [stores, setStores] = useState<InvStore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [storeId, setStoreId] = useState(searchParams.get("store_id") ?? "")
  const [category, setCategory] = useState(searchParams.get("category") ?? "")
  const [search, setSearch] = useState("")
  const [lowStockOnly, setLowStockOnly] = useState(searchParams.get("low_stock") === "true")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      if (stores.length === 0) {
        const { data } = await supabase
          .from("inv_stores")
          .select("id, store_code, name, project_id, status")
          .eq("status", "active")
          .order("name")
        setStores((data ?? []) as InvStore[])
      }

      let query = supabase
        .from("inv_stock")
        .select("*, inv_items!inner(item_code, name, category, unit_of_measure, min_stock_level, reorder_quantity)")
        .order("last_movement_at", { ascending: false })

      if (storeId) query = query.eq("store_id", storeId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (category) query = (query as any).eq("inv_items.category", category)

      const { data, error: fetchErr } = await query
      if (fetchErr) throw fetchErr

      setRows((data ?? []) as unknown as StockRow[])
    } catch (e) {
      setError((e as Error).message ?? "Failed to load stock")
    } finally {
      setLoading(false)
    }
  }, [storeId, category, stores.length])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter((r) => {
    const item = r.inv_items
    if (lowStockOnly) {
      const reorder = item?.reorder_quantity ?? 0
      if (reorder === 0 || r.quantity_available > reorder) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!item?.name.toLowerCase().includes(q) && !item?.item_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  function rowClass(row: StockRow) {
    const reorder = row.inv_items?.reorder_quantity ?? 0
    if (row.quantity_available === 0) return "bg-red-50/60"
    if (reorder > 0 && row.quantity_available <= reorder) return "bg-orange-50/60"
    return ""
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search item name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <button
          onClick={() => setLowStockOnly(!lowStockOnly)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
            lowStockOnly
              ? "border-orange-400 bg-orange-50 text-orange-700"
              : "border-input text-muted-foreground hover:bg-muted",
          )}
        >
          <AlertIcon className="h-4 w-4" />
          Low Stock Only
        </button>

        <Button variant="default" asChild className="ml-auto">
          <a href="/dashboard/inventory/grns/new"><Plus className="mr-2 h-4 w-4" />Create GRN</a>
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-100 border border-red-200" /> Zero stock</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-orange-100 border border-orange-200" /> Below reorder point</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">
              {lowStockOnly ? "All items are above their reorder points." : "No stock recorded for this store."}
            </p>
            {!lowStockOnly && (
              <p className="mt-1 text-sm text-muted-foreground">Create a GRN to receive the first delivery.</p>
            )}
            {!lowStockOnly && (
              <Button className="mt-4" onClick={() => router.push("/dashboard/inventory/grns/new")}>
                <Plus className="mr-2 h-4 w-4" />Create GRN
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">UoM</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Available</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Reserved</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Inspection</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Reorder Pt.</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Last Movement</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => {
                const item = row.inv_items
                const reorder = item?.reorder_quantity ?? 0
                const isZero = row.quantity_available === 0
                const isBelowReorder = reorder > 0 && row.quantity_available <= reorder

                return (
                  <tr key={row.id} className={cn("hover:bg-muted/20 transition-colors", rowClass(row))}>
                    <td className="px-4 py-2.5 font-mono text-xs">{item?.item_code ?? "—"}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {item?.name ?? "—"}
                      {isZero && <Badge variant="outline" className="ml-2 text-xs border-red-300 text-red-700 bg-red-50">No Stock</Badge>}
                      {!isZero && isBelowReorder && <Badge variant="outline" className="ml-2 text-xs border-orange-300 text-orange-700 bg-orange-50">Low Stock</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">{item?.category ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{item?.unit_of_measure ?? "—"}</td>
                    <td className={cn(
                      "px-4 py-2.5 text-right font-mono tabular-nums font-medium",
                      isZero ? "text-red-700" : isBelowReorder ? "text-orange-700" : "",
                    )}>
                      {row.quantity_available.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {row.quantity_reserved.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {row.quantity_under_inspection.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {reorder > 0 ? reorder.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {row.last_movement_at ? format(new Date(row.last_movement_at), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => router.push(`/dashboard/inventory/movements?item_id=${row.item_id}&store_id=${row.store_id}`)}
                        >
                          <BarChart2 className="mr-1 h-3 w-3" />Movements
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => router.push(`/dashboard/inventory/mrs/new?item_id=${row.item_id}&store_id=${row.store_id}`)}
                        >
                          <Plus className="mr-1 h-3 w-3" />MR
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary footer */}
      {!loading && !error && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
