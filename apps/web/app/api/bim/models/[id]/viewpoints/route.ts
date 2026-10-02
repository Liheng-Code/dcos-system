import { NextRequest, NextResponse } from "next/server";
import { createUserClient, createAdminClient } from "@/lib/supabase/server";
import {
  resolveTenantId,
  createViewpoint,
  listViewpoints,
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
    const viewpoints = await listViewpoints(supabase, tenantId, id);
    return NextResponse.json({ data: viewpoints });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] GET /models/:id/viewpoints:", err);
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
  const { name, camera_state, visibility_state } = body;
  if (!name || !camera_state) {
    return NextResponse.json(
      { error: "name and camera_state are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = await resolveTenantId(supabase, user.id);

  try {
    const viewpoint = await createViewpoint(
      supabase,
      tenantId,
      id,
      name,
      camera_state,
      visibility_state ?? {},
      user.id,
    );
    return NextResponse.json({ data: viewpoint }, { status: 201 });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] POST /models/:id/viewpoints:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
