import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { MdmCreateRequestInputSchema, MdmRequestListQuerySchema } from "@/lib/mdm/mdm-schemas";
import { validateMdmMaterialCreate } from "@/lib/mdm/material-request-schema";

export async function GET(request: NextRequest) {
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = MdmRequestListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters", issues: parsed.error.flatten() }, { status: 400 });
  const { status, entity_code, project_id, q, limit, offset } = parsed.data;
  let query = supabase.from("mdm_change_requests").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (status) query = query.eq("status", status);
  if (entity_code) query = query.eq("entity_code", entity_code);
  if (project_id) query = query.eq("project_id", project_id);
  if (q) query = query.ilike("reason", `%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Unable to load MDM requests", code: "MDM_READ_FAILED" }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = MdmCreateRequestInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const domainIssues = validateMdmMaterialCreate(input.entity_code, input.request_type, input.proposed_values);
  if (domainIssues) return NextResponse.json({ error: "Invalid MAT material payload", issues: domainIssues }, { status: 400 });
  const { data: entity, error: entityError } = await supabase
    .from("mdm_entity_registry")
    .select("schema_version")
    .eq("entity_code", input.entity_code)
    .eq("request_enabled", true)
    .maybeSingle();
  if (entityError || !entity) return NextResponse.json({ error: "Entity is not enabled for requests", code: "MDM_ENTITY_UNAVAILABLE" }, { status: 409 });
  const { data: requestId, error } = await supabase.rpc("mdm_create_request", {
    p_entity_code: input.entity_code,
    p_request_type: input.request_type,
    p_project_id: input.project_id ?? null,
    p_target_record_id: "target_record_id" in input ? input.target_record_id : null,
    p_proposed_values: input.proposed_values,
    p_schema_version: entity.schema_version,
    p_reason: input.reason,
    p_effective_at: input.effective_at ?? null,
  });
  if (error || !requestId) return NextResponse.json({ error: "Request creation was rejected", code: "MDM_CREATE_FAILED" }, { status: 409 });
  const { data, error: readError } = await supabase.from("mdm_change_requests").select("*").eq("id", requestId).single();
  if (readError || !data) return NextResponse.json({ error: "Request was created but could not be reloaded", code: "MDM_READ_FAILED" }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
