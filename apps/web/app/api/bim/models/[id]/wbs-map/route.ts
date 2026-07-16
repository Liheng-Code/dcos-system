import { NextRequest, NextResponse } from "next/server";
import { createUserClient, createAdminClient } from "@/lib/supabase/server";
import {
  resolveTenantId,
  bulkMapElementsToWbs,
  listWbsMap,
  BimError,
} from "@/lib/bim/bim-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const tenantId = await resolveTenantId(supabase, user.id);

  try {
    const mappings = await listWbsMap(supabase, tenantId, id);
    return NextResponse.json({ data: mappings });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] GET /models/:id/wbs-map:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userClient = await createUserClient();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { mappings } = body;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return NextResponse.json(
      { error: "mappings array is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = await resolveTenantId(supabase, user.id);

  try {
    const count = await bulkMapElementsToWbs(
      supabase,
      tenantId,
      id,
      mappings,
      user.id,
    );
    return NextResponse.json({ data: { mapped: count } }, { status: 201 });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] POST /models/:id/wbs-map:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
