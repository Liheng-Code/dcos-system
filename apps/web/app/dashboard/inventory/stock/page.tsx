"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { Suspense } from "react"
import { StockBalanceList } from "@/components/inv/stock-balance-list"

export default function StockBalancePage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Stock Balance</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Current stock levels across all stores
        </p>
      </div>
      <Suspense>
        <StockBalanceList />
      </Suspense>
    </div>
  )
}
