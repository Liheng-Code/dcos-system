"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"
import { Suspense } from "react"
import { GrnList } from "@/components/inv/grn-list"

export default function GrnListPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight">Goods Received Notes</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Record and confirm material deliveries against Purchase Orders
        </p>
      </div>
      <Suspense>
        <GrnList />
      </Suspense>
    </div>
  )
}
