import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createUserClient, createAdminClient } from "@/lib/supabase/server"
import { convertTenderToProjectBudget, TenderError } from "@/lib/tender-service"

const ParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userClient = await createUserClient()
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  try {
    const text = await req.text()
    if (text) JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parse = ParamsSchema.safeParse({ id })
  if (!parse.success) {
    return NextResponse.json({ error: "Validation error", details: parse.error.flatten() }, { status: 422 })
  }

  const supabase = createAdminClient()

  try {
    const result = await convertTenderToProjectBudget(supabase, parse.data.id, user.id)
    return NextResponse.json({
      data: {
        project_id: result.project_id,
        sections_created: result.sections_created,
        items_created: result.items_created,
        prelim_items_created: result.prelim_items_created,
        total_amount: result.total_amount,
        converted_at: new Date().toISOString(),
      },
    })
  } catch (err) {
    if (err instanceof TenderError) {
      return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status })
    }
    console.error("[TENDER] POST /tenders/:id/convert-to-budget:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
