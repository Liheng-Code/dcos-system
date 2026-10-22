import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";
import { MdmUpdateDraftInputSchema } from "@/lib/mdm/mdm-schemas";
import { validateMdmMaterialCreate } from "@/lib/mdm/material-request-schema";

const IdSchema = z.uuid();

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const [{ data: request, error }, { data: events, error: eventError }] = await Promise.all([
    supabase.from("mdm_change_requests").select("*").eq("id", id).maybeSingle(),
    supabase.from("mdm_request_events").select("*").eq("request_id", id).order("created_at"),
  ]);
  if (error || eventError) return NextResponse.json({ error: "Unable to load request", code: "MDM_READ_FAILED" }, { status: 500 });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  return NextResponse.json({ data: { ...request, events: events ?? [] } });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!IdSchema.safeParse(id).success) return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = MdmUpdateDraftInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft", issues: parsed.error.flatten() }, { status: 400 });
  const { data: current, error: readError } = await supabase.from("mdm_change_requests").select("entity_code, request_type").eq("id", id).maybeSingle();
  if (readError || !current) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const domainIssues = validateMdmMaterialCreate(current.entity_code, current.request_type, parsed.data.proposed_values);
  if (domainIssues) return NextResponse.json({ error: "Invalid MAT material payload", issues: domainIssues }, { status: 400 });
  const { data, error } = await supabase.rpc("mdm_update_draft", {
    p_request_id: id,
    p_expected_version: parsed.data.expected_version,
    p_proposed_values: parsed.data.proposed_values,
    p_reason: parsed.data.reason,
    p_effective_at: parsed.data.effective_at ?? null,
  });
  if (error) return NextResponse.json({ error: "Draft update was rejected", code: "MDM_UPDATE_FAILED" }, { status: 409 });
  return NextResponse.json({ data });
}
