"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  DollarSign, AlertTriangle, Truck, ClipboardList, ArrowLeftRight,
  Package, Plus, Eye, PlayCircle, RefreshCw,
} from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import type { MovementRow } from "./inv-types"
import { MOVEMENT_TYPE_LABELS } from "./inv-types"

interface DashboardStats {
  totalStockValue: number
  itemsBelowReorder: number
  pendingGrns: number
  pendingMrs: number
  pendingTransfers: number
  stockTakeInProgress: boolean
}

function StatCard({
  label, value, sub, icon: Icon, alert, href,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType<{ className?: string }>
  alert?: boolean
  href?: string
}) {
  const inner = (
    <Card className={cn("transition-shadow", href && "hover:shadow-md cursor-pointer")}>
      <CardContent className="flex items-start gap-4 pt-5 pb-5 px-5">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          alert ? "bg-orange-100" : "bg-primary/10",
        )}>
          <Icon className={cn("h-5 w-5", alert ? "text-orange-600" : "text-primary")} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

export function InvDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      const [stockRes, grnRes, mrRes, transferRes, stocktakeRes, movRes] = await Promise.all([
        supabase
          .from("inv_stock")
          .select("quantity_available, unit_cost_fifo, inv_items!inner(reorder_quantity)")
          .eq("inv_items.is_active", true),

        supabase
          .from("inv_grns")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),

        supabase
          .from("inv_material_requisitions")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted"]),

        supabase
          .from("inv_transfers")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "approved"]),

        supabase
          .from("inv_stocktakes")
          .select("id")
          .in("status", ["open", "counting", "pending_approval"])
          .maybeSingle(),

        supabase
          .from("inv_movements")
          .select("*, inv_items!inner(item_code, name, unit_of_measure)")
          .order("created_at", { ascending: false })
          .limit(20),
      ])

      type StockSummary = {
        quantity_available: number
        unit_cost_fifo: number
        inv_items: { reorder_quantity: number | null }
      }
      const stockData = (stockRes.data ?? []) as unknown as StockSummary[]

      let totalValue = 0
      let belowReorder = 0
      for (const s of stockData) {
        totalValue += s.quantity_available * s.unit_cost_fifo
        const reorder = s.inv_items?.reorder_quantity ?? 0
        if (reorder > 0 && s.quantity_available <= reorder) belowReorder++
      }

      setStats({
        totalStockValue: totalValue,
        itemsBelowReorder: belowReorder,
        pendingGrns: grnRes.count ?? 0,
        pendingMrs: mrRes.count ?? 0,
        pendingTransfers: transferRes.count ?? 0,
        stockTakeInProgress: !!stocktakeRes.data,
      })
      setMovements((movRes.data ?? []) as unknown as MovementRow[])
    } catch {
      setError("Failed to load dashboard data")
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={load}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  const s = stats!

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Stock Value"
          value={`$${s.totalStockValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          href="/dashboard/inventory/stock"
        />
        <StatCard
          label="Below Reorder Point"
          value={s.itemsBelowReorder}
          icon={AlertTriangle}
          alert={s.itemsBelowReorder > 0}
          href="/dashboard/inventory/stock?low_stock=true"
        />
        <StatCard
          label="Pending GRNs"
          value={s.pendingGrns}
          sub="to confirm"
          icon={Truck}
          href="/dashboard/inventory/grns?status=draft"
        />
        <StatCard
          label="Pending MRs"
          value={s.pendingMrs}
          sub="to approve"
          icon={ClipboardList}
          href="/dashboard/inventory/mrs?status=submitted"
        />
        <StatCard
          label="Pending Transfers"
          value={s.pendingTransfers}
          icon={ArrowLeftRight}
          href="/dashboard/inventory/transfers"
        />
        <Card className={cn(s.stockTakeInProgress ? "border-red-300 bg-red-50/50" : "")}>
          <CardContent className="flex items-start gap-4 pt-5 pb-5 px-5">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              s.stockTakeInProgress ? "bg-red-100" : "bg-muted",
            )}>
              <Package className={cn("h-5 w-5", s.stockTakeInProgress ? "text-red-600" : "text-muted-foreground")} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Stock Take</p>
              <p className="mt-0.5 text-sm font-semibold leading-tight">
                {s.stockTakeInProgress ? "In Progress" : "None active"}
              </p>
              {s.stockTakeInProgress && (
                <Badge variant="outline" className="mt-1 text-xs border-red-300 text-red-700 bg-red-50">Store Locked</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard/inventory/grns/new"><Plus className="mr-2 h-4 w-4" />Create GRN</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/inventory/mrs/new"><Plus className="mr-2 h-4 w-4" />New MR</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/inventory/stock?low_stock=true"><Eye className="mr-2 h-4 w-4" />View Low Stock</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/inventory/stocktakes/new"><PlayCircle className="mr-2 h-4 w-4" />Start Stock Take</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/inventory/adjustments/new"><RefreshCw className="mr-2 h-4 w-4" />New Adjustment</Link>
        </Button>
      </div>

      {/* Recent movements */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Movements</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/inventory/movements">View all</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {movements.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No movements recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Reference</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map((m) => {
                    const item = m.inv_items as { item_code: string; name: string; unit_of_measure: string } | undefined
                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{item?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{item?.item_code}</p>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type}
                        </td>
                        <td className={cn(
                          "px-4 py-2.5 text-right font-mono font-medium tabular-nums",
                          m.quantity > 0 ? "text-emerald-700" : "text-red-700",
                        )}>
                          {m.quantity > 0 ? "+" : ""}{m.quantity.toFixed(2)} {item?.unit_of_measure}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.reference_number}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {format(new Date(m.movement_date), "dd MMM yyyy")}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
