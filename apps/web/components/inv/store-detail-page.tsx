"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Pencil, MapPin, AlertOctagon } from "lucide-react"
import { STORE_TYPE_LABELS, LOCATION_TYPE_LABELS } from "./inv-types"
import type { InvStore, LocationRow } from "./inv-types"
import { StoreForm } from "./store-form"
import { LocationForm } from "./location-form"
import { LabelPrintButton } from "./label-print-button"

interface ProjectOption {
  id: string
  project_code: string
  project_name: string
}

const LOCATION_ORDER: LocationRow["location_type"][] = ["zone", "aisle", "rack", "bin"]

export function StoreDetailPage({ id }: { id: string }) {
  const router = useRouter()

  const [store, setStore] = useState<InvStore | null>(null)
  const [project, setProject] = useState<ProjectOption | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [storeFormOpen, setStoreFormOpen] = useState(false)
  const [locationFormOpen, setLocationFormOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<LocationRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: storeData, error: storeErr } = await supabase
        .from("inv_stores")
        .select("*")
        .eq("id", id)
        .single()
      if (storeErr || !storeData) throw new Error("Store not found")
      setStore(storeData as InvStore)

      const [projRes, locRes] = await Promise.all([
        supabase.from("projects").select("id, project_code, project_name").eq("id", (storeData as InvStore).project_id).single(),
        supabase.from("inv_locations").select("*").eq("store_id", id).order("code"),
      ])
      setProject((projRes.data ?? null) as ProjectOption | null)
      setLocations((locRes.data ?? []) as LocationRow[])
    } catch (e) {
      setError((e as Error).message ?? "Failed to load store")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  function openCreateLocation() {
    setEditingLocation(null)
    setLocationFormOpen(true)
  }

  function openEditLocation(loc: LocationRow) {
    setEditingLocation(loc)
    setLocationFormOpen(true)
  }

  function codeOf(locId: string | null) {
    if (!locId) return "—"
    return locations.find(l => l.id === locId)?.code ?? "—"
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (error || !store) return (
    <div className="max-w-5xl mx-auto">
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground mb-3">{error ?? "Store not found"}</p>
          <Button variant="outline" onClick={() => router.push("/dashboard/inventory/stores")}>Back to list</Button>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/inventory/stores")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{store.name}</h1>
              <Badge variant="outline" className="text-xs">{store.store_code}</Badge>
              <Badge variant="outline" className="text-xs">{STORE_TYPE_LABELS[store.store_type ?? ""] ?? store.store_type}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {project ? `${project.project_code} — ${project.project_name}` : "—"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setStoreFormOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />Edit Store
        </Button>
      </div>

      {/* Store details */}
      <Card>
        <CardHeader><CardTitle className="text-base">Store Details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="font-medium capitalize">{store.status ?? "active"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Location Description</dt>
              <dd>{store.location_description || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Capacity</dt>
              <dd>{store.capacity_qty != null ? `${store.capacity_qty} ${store.capacity_uom ?? ""}` : "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Locations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Locations & Bins ({locations.length})
          </CardTitle>
          <Button size="sm" onClick={openCreateLocation}>
            <Plus className="mr-2 h-4 w-4" />New Location
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No locations defined yet. Add zones, aisles, racks, and bins to organize this store.
            </p>
          ) : (
            LOCATION_ORDER.map(type => {
              const group = locations.filter(l => l.location_type === type)
              if (group.length === 0) return null
              return (
                <div key={type} className="border-t border-border first:border-t-0">
                  <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {LOCATION_TYPE_LABELS[type]}s ({group.length})
                  </p>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {group.map(loc => (
                        <tr key={loc.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold w-32">{loc.code}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            Parent: {codeOf(loc.parent_id)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {loc.capacity_qty != null ? `Capacity: ${loc.capacity_qty}` : ""}
                          </td>
                          <td className="px-4 py-2.5">
                            {loc.is_dg_allowed && (
                              <Badge variant="outline" className="text-xs border-red-300 text-red-700 bg-red-50 gap-1">
                                <AlertOctagon className="h-3 w-3" />DG OK
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              variant="outline"
                              className={loc.status === "active"
                                ? "text-xs border-emerald-300 text-emerald-700 bg-emerald-50"
                                : "text-xs border-gray-300 text-gray-600 bg-gray-50"}
                            >
                              {loc.status === "active" ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {type === "bin" && <LabelPrintButton type="bin" id={loc.id} size="icon" variant="ghost" />}
                              <Button variant="ghost" size="icon" onClick={() => openEditLocation(loc)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {storeFormOpen && (
        <StoreForm
          store={store}
          open={storeFormOpen}
          onOpenChange={setStoreFormOpen}
          onSaved={load}
        />
      )}

      {locationFormOpen && (
        <LocationForm
          storeId={id}
          location={editingLocation}
          locations={locations}
          open={locationFormOpen}
          onOpenChange={setLocationFormOpen}
          onSaved={load}
        />
      )}
    </div>
  )
}
