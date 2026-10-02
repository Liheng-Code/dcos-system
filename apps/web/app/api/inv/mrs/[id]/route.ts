import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { resolveTenantId } from "@/lib/inventory/inv-service"

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

  const { data: mr, error } = await supabase
    .from("inv_material_requisitions")
    .select("*, inv_mr_lines(*)")
    .eq("id", id)
    .single()

  if (error || !mr) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (mr.tenant_id !== tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: mr })
}
