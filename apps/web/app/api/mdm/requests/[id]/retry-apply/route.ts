import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";

const IdSchema = z.uuid();
const RetryInputSchema = z.object({
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = RetryInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid retry request", issues: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await supabase.rpc("mdm_retry_material_apply", {
    p_request_id: id,
    p_expected_version: parsed.data.expected_version,
    p_reason: parsed.data.reason,
  });
  if (error) return NextResponse.json({ error: "Retry authorization was rejected", code: "MDM_RETRY_FAILED" }, { status: 409 });
  return NextResponse.json({ data });
}
