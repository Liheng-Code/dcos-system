import { NextRequest, NextResponse } from "next/server"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { getLabelData, resolveTenantId, InvError } from "@/lib/inventory/inv-service"

const VALID_TYPES = ["item", "bin", "tool"] as const
type LabelType = (typeof VALID_TYPES)[number]

function isLabelType(value: string): value is LabelType {
  return (VALID_TYPES as readonly string[]).includes(value)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { type, id } = await params
  if (!isLabelType(type)) {
    return NextResponse.json({ error: `Invalid label type '${type}'`, code: "INV_LABEL_INVALID_TYPE" }, { status: 400 })
  }

  const supabase = createAdminClient()
  const tenantId = await resolveTenantId(supabase, user.id)

  try {
    const label = await getLabelData(supabase, tenantId, type, id)
    return NextResponse.json({ data: label })
  } catch (err) {
    if (err instanceof InvError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[INV] GET /labels/:type/:id:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
