"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { Suspense } from "react"
import { TransferList } from "@/components/inventory/transfer-list"

export default function TransferListPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Stock Transfers</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Move stock between stores and projects
        </p>
      </div>
      <Suspense>
        <TransferList />
      </Suspense>
    </div>
  )
}
