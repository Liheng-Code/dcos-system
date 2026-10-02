import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { approveStocktakeLine, resolveTenantId, InvError } from "@/lib/inventory/inv-service"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { lineId } = await params
  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const line = await approveStocktakeLine(supabase, user.id, tenantId, lineId)
    return NextResponse.json({ data: line })
  } catch (err) {
    if (err instanceof InvError) return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    console.error("[INV] POST /stocktakes/:id/lines/:lineId/approve:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
