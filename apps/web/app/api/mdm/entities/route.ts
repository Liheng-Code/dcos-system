import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";

const ConfigSchema = z.object({
  entity_code: z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/),
  enabled: z.boolean(),
  expected_config_version: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
}).strict();

export async function GET() {
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const [{ data, error }, { data: canConfigure }, { data: registryEvents }] = await Promise.all([
    supabase
    .from("mdm_entity_registry")
    .select("entity_code, display_name, entity_scope, request_enabled, adapter_status, schema_version, config_version")
    .order("display_name"),
    supabase.rpc("has_permission", { p_module: "mdm", p_action: "entity_registry", p_field: "configure" }),
    supabase.from("mdm_registry_events").select("id, entity_code, actor_id, prior_enabled, new_enabled, config_version, created_at").order("created_at", { ascending: false }).limit(25),
  ]);
  if (error) return NextResponse.json({ error: "Unable to load MDM entities", code: "MDM_READ_FAILED" }, { status: 500 });
  return NextResponse.json({ data, canConfigure: Boolean(canConfigure), registryEvents: registryEvents ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createUserClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = ConfigSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid entity configuration", issues: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await supabase.rpc("mdm_set_entity_request_enabled", {
    p_entity_code: parsed.data.entity_code,
    p_enabled: parsed.data.enabled,
    p_expected_config_version: parsed.data.expected_config_version,
    p_reason: parsed.data.reason,
  });
  if (error) return NextResponse.json({ error: "Entity configuration was rejected", code: "MDM_CONFIG_FAILED" }, { status: 409 });
  return NextResponse.json({ data: { config_version: data } });
}
