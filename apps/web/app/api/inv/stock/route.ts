import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { getStockByStore, resolveTenantId, InvError } from "@/lib/inventory/inv-service"

export async function GET(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const storeId = searchParams.get("store_id")
  if (!storeId) {
    return NextResponse.json({ error: "store_id query parameter is required" }, { status: 400 })
  }

  const category = searchParams.get("category") ?? undefined
  const lowStockOnly = searchParams.get("low_stock") === "true"

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const stock = await getStockByStore(supabase, storeId, tenantId, { category, lowStockOnly })
    return NextResponse.json({ data: stock })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error("[INV] GET /stock:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
