import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { LocationCreateSchema } from "@/lib/inv/inv-schemas"
import { createLocation, resolveTenantId, InvError } from "@/lib/inv/inv-service"

export async function GET(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  const { searchParams } = req.nextUrl
  const storeId = searchParams.get("store_id")
  const parentId = searchParams.get("parent_id")

  let query = supabase
    .from("inv_locations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("code")

  if (storeId) query = query.eq("store_id", storeId)
  if (parentId) query = query.eq("parent_id", parentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parse = LocationCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })
  }

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const location = await createLocation(supabase, user.id, tenantId, parse.data)
    return NextResponse.json({ data: location }, { status: 201 })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[INV] POST /locations:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
