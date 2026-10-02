import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { AdjustmentCreateSchema } from "@/lib/inventory/inv-schemas"
import { createAdjustment, resolveTenantId, InvError } from "@/lib/inventory/inv-service"

export async function GET(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  const { searchParams } = req.nextUrl
  const status = searchParams.get("status")
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100)
  const offset = (page - 1) * limit

  let query = supabase
    .from("inv_adjustments")
    .select("*, inv_adjustment_lines(count)", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq("status", status)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    meta: { total: count ?? 0, page, limit },
  })
}

export async function POST(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const parse = AdjustmentCreateSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const adjustment = await createAdjustment(supabase, user.id, tenantId, parse.data)
    return NextResponse.json({ data: adjustment }, { status: 201 })
  } catch (err) {
    if (err instanceof InvError) return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    console.error("[INV] POST /adjustments:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
