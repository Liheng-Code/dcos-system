import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { AdjustmentRejectSchema } from "@/lib/inv/inv-schemas"
import { rejectAdjustment, resolveTenantId, InvError } from "@/lib/inv/inv-service"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const parse = AdjustmentRejectSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const adjustment = await rejectAdjustment(supabase, user.id, tenantId, id, parse.data.rejection_reason)
    return NextResponse.json({ data: adjustment })
  } catch (err) {
    if (err instanceof InvError) return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    console.error("[INV] POST /adjustments/:id/reject:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
