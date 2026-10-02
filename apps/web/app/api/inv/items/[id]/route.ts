import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { ItemUpdateSchema } from "@/lib/inventory/inv-schemas"
import { updateItem, resolveTenantId, InvError } from "@/lib/inventory/inv-service"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  const { data: item, error } = await supabase
    .from("inv_items")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Cross-tenant guard (returns 404 to avoid existence leak)
  if (item.tenant_id !== tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: item })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parse = ItemUpdateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })
  }

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const item = await updateItem(supabase, user.id, tenantId, id, parse.data)
    return NextResponse.json({ data: item })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[INV] PATCH /items/:id:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
