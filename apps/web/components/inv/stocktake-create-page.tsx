"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Loader2 } from "lucide-react"
import type { InvStore } from "./inv-types"

interface ProjectOption {
  id: string
  project_code: string
  project_name: string
}

export function StocktakeCreatePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [stores, setStores] = useState<InvStore[]>([])

  const [projectId, setProjectId] = useState("")
  const [storeId, setStoreId] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from("projects").select("id, project_code, project_name").order("project_code"),
      supabase.from("inv_stores").select("*").eq("is_active", true).order("name"),
    ]).then(([pRes, sRes]) => {
      if (pRes.data) setProjects(pRes.data as ProjectOption[])
      if (sRes.data) setStores(sRes.data as InvStore[])
    }).finally(() => setLoading(false))
  }, [])

  async function handleSubmit() {
    if (!projectId || !storeId) {
      toast.error("Select a project and store")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/inv/stocktakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          store_id: storeId,
          notes: notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to create stocktake")
      toast.success(`Stocktake ${json.data.stocktake_number} created`)
      router.push(`/dashboard/inventory/stocktakes/${json.data.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Stock Take</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create a stocktake to count physical inventory in a store
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Stocktake Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
            >
              <option value="">Select project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Store <span className="text-destructive">*</span></Label>
            <select
              className="flex w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={storeId}
              onChange={e => setStoreId(e.target.value)}
              disabled={!projectId}
            >
              <option value="">Select store…</option>
              {stores.filter(s => !projectId || s.project_id === projectId).map(s =>
                <option key={s.id} value={s.id}>{s.name} ({s.store_code})</option>
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes about this stocktake"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Stock Take
        </Button>
      </div>
    </div>
  )
}
