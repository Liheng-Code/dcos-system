import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { resolveTenantId, InvError } from "@/lib/inv/inv-service"

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

  const { data: grn, error } = await supabase
    .from("inv_grns")
    .select("*, inv_grn_lines(*)")
    .eq("id", id)
    .single()

  if (error || !grn) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Cross-tenant guard (returns 404 to avoid existence leak)
  if (grn.tenant_id !== tenantId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: grn })
}
