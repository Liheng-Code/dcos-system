"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Package, Plus, Pencil, AlertOctagon, Layers as LayersIcon } from "lucide-react"
import { CATEGORIES } from "./inv-types"
import type { InvItem } from "./inv-types"
import { ItemForm } from "./item-form"
import { LabelPrintButton } from "./label-print-button"

export function ItemList() {
  const [rows, setRows] = useState<InvItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [activeOnly, setActiveOnly] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InvItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (category) params.set("category", category)
      if (activeOnly) params.set("is_active", "true")
      if (search) params.set("search", search)

      const qs = params.toString()
      const res = await fetch(`/api/inv/items${qs ? `?${qs}` : ""}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load items")
      setRows((json.data ?? []) as InvItem[])
    } catch (e) {
      setError((e as Error).message ?? "Failed to load items")
    } finally {
      setLoading(false)
    }
  }, [category, activeOnly, search])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditingItem(null)
    setFormOpen(true)
  }

  function openEdit(item: InvItem) {
    setEditingItem(item)
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
            placeholder="Search item code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <button
          onClick={() => setActiveOnly(!activeOnly)}
          className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          {activeOnly ? "Active Only" : "All Items"}
        </button>

        <Button className="ml-auto" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />New Item
        </Button>
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
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No items found.</p>
            <p className="mt-1 text-sm text-muted-foreground">Click &apos;New Item&apos; to add the first item to the master list.</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />New Item
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
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">UoM</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Min</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Max</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Reorder</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Flags</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{item.item_code}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{item.unit_of_measure}</td>
                  <td className="px-4 py-3 text-right text-xs">{item.min_stock_level ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-xs">{item.max_stock_level ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-xs">{item.reorder_quantity ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.is_dg && (
                        <Badge variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50 gap-1">
                          <AlertOctagon className="h-3 w-3" />DG
                        </Badge>
                      )}
                      {item.is_batch_managed && (
                        <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50 gap-1">
                          <LayersIcon className="h-3 w-3" />Batch
                        </Badge>
                      )}
                      {item.is_inspection_required && (
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                          Inspect
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={item.is_active
                        ? "text-xs border-emerald-300 text-emerald-700 bg-emerald-50"
                        : "text-xs border-gray-300 text-gray-600 bg-gray-50"}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <LabelPrintButton type="item" id={item.id} size="icon" variant="ghost" />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">{rows.length} item{rows.length !== 1 ? "s" : ""}</p>
      )}

      {formOpen && (
        <ItemForm
          item={editingItem}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={load}
        />
      )}
    </div>
  )
}
