"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Warehouse, Plus, ChevronRight } from "lucide-react"
import { STORE_TYPE_LABELS } from "./inv-types"
import type { InvStore } from "./inv-types"
import { StoreForm } from "./store-form"

interface ProjectOption {
  id: string
  project_code: string
  project_name: string
}

const STORE_TYPE_CLASSES: Record<string, string> = {
  central: "border-blue-300 text-blue-700 bg-blue-50",
  site: "border-emerald-300 text-emerald-700 bg-emerald-50",
  temporary: "border-amber-300 text-amber-700 bg-amber-50",
  yard: "border-purple-300 text-purple-700 bg-purple-50",
  dg: "border-red-300 text-red-700 bg-red-50",
}

export function StoreList() {
  const router = useRouter()

  const [rows, setRows] = useState<InvStore[]>([])
  const [projects, setProjects] = useState<Record<string, ProjectOption>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [storeType, setStoreType] = useState("")

  const [formOpen, setFormOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<InvStore | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      const [storesRes, projectsRes] = await Promise.all([
        supabase.from("inv_stores").select("*").order("name"),
        supabase.from("projects").select("id, project_code, project_name"),
      ])
      if (storesRes.error) throw storesRes.error

      const projMap: Record<string, ProjectOption> = {}
      for (const p of (projectsRes.data ?? []) as ProjectOption[]) projMap[p.id] = p
      setProjects(projMap)
      setRows((storesRes.data ?? []) as InvStore[])
    } catch (e) {
      setError((e as Error).message ?? "Failed to load stores")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(s => {
    if (storeType && s.store_type !== storeType) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !s.store_code.toLowerCase().includes(q)) return false
    }
    return true
  })

  function openCreate() {
    setEditingStore(null)
    setFormOpen(true)
  }

  function openEdit(e: React.MouseEvent, store: InvStore) {
    e.stopPropagation()
    setEditingStore(store)
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
            placeholder="Search store code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="flex h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={storeType}
          onChange={(e) => setStoreType(e.target.value)}
        >
          <option value="">All Store Types</option>
          {Object.entries(STORE_TYPE_LABELS).map(([key, l]) => <option key={key} value={key}>{l}</option>)}
        </select>

        <Button className="ml-auto" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />New Store
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
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
            <Warehouse className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No stores found.</p>
            <p className="mt-1 text-sm text-muted-foreground">Click &apos;New Store&apos; to register a warehouse, site store, or yard.</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />New Store
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
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Project</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Capacity</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((store) => {
                const project = projects[store.project_id]
                return (
                  <tr
                    key={store.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/dashboard/inventory/stores/${store.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{store.store_code}</td>
                    <td className="px-4 py-3 font-medium">{store.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-xs ${STORE_TYPE_CLASSES[store.store_type ?? ""] ?? ""}`}>
                        {STORE_TYPE_LABELS[store.store_type ?? ""] ?? store.store_type ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {project ? `${project.project_code} — ${project.project_name}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {store.capacity_qty != null ? `${store.capacity_qty} ${store.capacity_uom ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={(store.status ?? "active") === "active"
                          ? "text-xs border-emerald-300 text-emerald-700 bg-emerald-50"
                          : "text-xs border-gray-300 text-gray-600 bg-gray-50"}
                      >
                        {(store.status ?? "active") === "active" ? "Active" : "Closed"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => openEdit(e, store)}>
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

      {!loading && !error && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">{filtered.length} store{filtered.length !== 1 ? "s" : ""}</p>
      )}

      {formOpen && (
        <StoreForm
          store={editingStore}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={load}
        />
      )}
    </div>
  )
}
