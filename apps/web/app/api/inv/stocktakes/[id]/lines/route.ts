import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { StocktakeLineUpdateSchema } from "@/lib/inv/inv-schemas"
import { updateStocktakeLineCount, resolveTenantId, InvError } from "@/lib/inv/inv-service"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await params // stocktake id validated by service via line FK

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const parse = StocktakeLineUpdateSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const line = await updateStocktakeLineCount(supabase, user.id, tenantId, parse.data.line_id, parse.data.counted_quantity, parse.data.explanation)
    return NextResponse.json({ data: line })
  } catch (err) {
    if (err instanceof InvError) return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    console.error("[INV] PATCH /stocktakes/:id/lines:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
