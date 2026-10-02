import { NextRequest, NextResponse } from "next/server";
import { createUserClient, createAdminClient } from "@/lib/supabase/server";
import {
  resolveTenantId,
  getModel,
  supersedeModel,
  updateModel,
  deleteModel,
  BimError,
} from "@/lib/design/bim/bim-service";

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
    const model = await getModel(supabase, tenantId, id);
    return NextResponse.json({ data: model });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] GET /models/:id:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

  const supabase = createAdminClient();
  const tenantId = await resolveTenantId(supabase, user.id);

  try {
    const body = await req.json().catch(() => ({}));

    // Supersede action
    if (body.action === "supersede") {
      const model = await supersedeModel(supabase, tenantId, id);
      return NextResponse.json({ data: model });
    }

    // Update metadata
    const updates: Record<string, string> = {};
    if (body.model_name !== undefined) updates.model_name = body.model_name;
    if (body.discipline !== undefined) updates.discipline = body.discipline;
    if (body.ifc_schema !== undefined) updates.ifc_schema = body.ifc_schema;
    if (body.status !== undefined) updates.status = body.status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const model = await updateModel(supabase, tenantId, id, updates);
    return NextResponse.json({ data: model });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] PATCH /models/:id:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    await deleteModel(supabase, tenantId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] DELETE /models/:id:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
