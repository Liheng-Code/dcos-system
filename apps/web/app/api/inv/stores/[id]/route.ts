import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { StoreUpdateSchema } from "@/lib/inv/inv-schemas"
import { updateStore, resolveTenantId, InvError } from "@/lib/inv/inv-service"

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

  const { data: store, error } = await supabase
    .from("inv_stores")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !store) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (store.tenant_id !== tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: store })
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

  const parse = StoreUpdateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })
  }

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const store = await updateStore(supabase, user.id, tenantId, id, parse.data)
    return NextResponse.json({ data: store })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[INV] PATCH /stores/:id:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
