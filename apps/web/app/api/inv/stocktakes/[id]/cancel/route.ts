import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { StocktakeCancelSchema } from "@/lib/inventory/inv-schemas"
import { cancelStocktake, resolveTenantId, InvError } from "@/lib/inventory/inv-service"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { body = {} }

  const parse = StocktakeCancelSchema.safeParse(body ?? {})

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const stocktake = await cancelStocktake(supabase, user.id, tenantId, id, parse.success ? parse.data.reason : undefined)
    return NextResponse.json({ data: stocktake })
  } catch (err) {
    if (err instanceof InvError) return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    console.error("[INV] POST /stocktakes/:id/cancel:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
