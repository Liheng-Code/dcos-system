import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { ItemCreateSchema } from "@/lib/inv/inv-schemas"
import { createItem, listItems, resolveTenantId, InvError } from "@/lib/inv/inv-service"

export async function GET(req: NextRequest) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  const { searchParams } = req.nextUrl
  const category = searchParams.get("category") ?? undefined
  const isActiveParam = searchParams.get("is_active")
  const isActive = isActiveParam === null ? undefined : isActiveParam === "true"
  const search = searchParams.get("search") ?? undefined

  try {
    const items = await listItems(supabase, tenantId, { category, isActive, search })
    return NextResponse.json({ data: items })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[INV] GET /items:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
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

  const parse = ItemCreateSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })
  }

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const item = await createItem(supabase, user.id, tenantId, parse.data)
    return NextResponse.json({ data: item }, { status: 201 })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[INV] POST /items:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
