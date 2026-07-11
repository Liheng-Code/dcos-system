import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { resolveTenantId } from "@/lib/inv/inv-service"

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

  const { data: transfer, error } = await supabase
    .from("inv_transfers")
    .select("*, inv_transfer_lines(*, inv_items(item_code, name, unit_of_measure))")
    .eq("id", id)
    .single()

  if (error || !transfer) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (transfer.tenant_id !== tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: transfer })
}
