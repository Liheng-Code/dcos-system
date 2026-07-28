"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { ItemList } from "@/components/inv/item-list"

export default function ItemMasterPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return }
      setChecking(false)
    })
  }, [router])

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Item Master</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage the inventory item catalog — stock levels, categories, and DG/batch flags
        </p>
      </div>
      <ItemList />
    </div>
  )
}
