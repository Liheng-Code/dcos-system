import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";
import { MdmTransitionInputSchema } from "@/lib/mdm/mdm-schemas";
import { validateMdmMaterialCreate } from "@/lib/mdm/material-request-schema";

const IdSchema = z.uuid();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = MdmTransitionInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid transition", issues: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.action === "submit") {
    const { data: current, error: readError } = await supabase.from("mdm_change_requests").select("entity_code, request_type, proposed_values").eq("id", id).maybeSingle();
    if (readError || !current) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    const domainIssues = validateMdmMaterialCreate(current.entity_code, current.request_type, current.proposed_values);
    if (domainIssues) return NextResponse.json({ error: "Invalid MAT material payload", issues: domainIssues }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("mdm_transition_request", {
    p_request_id: id,
    p_expected_version: parsed.data.expected_version,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return NextResponse.json({ error: "Transition was rejected", code: "MDM_TRANSITION_FAILED" }, { status: 409 });
  return NextResponse.json({ data });
}
