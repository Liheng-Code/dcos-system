import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { StoreCreateSchema } from "@/lib/inv/inv-schemas"
import { createStore, resolveTenantId, InvError } from "@/lib/inv/inv-service"

export async function GET(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  const { searchParams } = req.nextUrl
  const projectId = searchParams.get("project_id")
  const status = searchParams.get("status")

  let query = supabase
    .from("inv_stores")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name")

  if (projectId) query = query.eq("project_id", projectId)
  if (status) query = query.eq("status", status)

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

  const parse = StoreCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })
  }

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const store = await createStore(supabase, user.id, tenantId, parse.data)
    return NextResponse.json({ data: store }, { status: 201 })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[INV] POST /stores:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
