import { NextRequest, NextResponse } from "next/server";
import { createUserClient, createAdminClient } from "@/lib/supabase/server";
import {
  resolveTenantId,
  listModels,
  createModelRecord,
  supersedePreviousRevisions,
  BimError,
} from "@/lib/bim/bim-service";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId)
    return NextResponse.json(
      { error: "project_id query parameter is required" },
      { status: 400 },
    );

  try {
    const userClient = await createUserClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createAdminClient();
    const tenantId = await resolveTenantId(supabase, user.id);
    const models = await listModels(supabase, tenantId, projectId);
    return NextResponse.json({ data: models });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] GET /models:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userClient = await createUserClient();
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { project_id, model_name, discipline, ifc_schema, file_url, file_size_mb } = body;
    if (!project_id || !model_name || !file_url) {
      return NextResponse.json(
        { error: "project_id, model_name, and file_url are required" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const tenantId = await resolveTenantId(supabase, user.id);

    const model = await createModelRecord(
      supabase,
      tenantId,
      project_id,
      model_name,
      discipline ?? "FED",
      ifc_schema ?? "IFC4",
      file_url,
      file_size_mb ?? 0,
      user.id,
    );
    await supersedePreviousRevisions(
      supabase,
      tenantId,
      project_id,
      model_name,
      model.id,
    );
    return NextResponse.json({ data: model }, { status: 201 });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] POST /models:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
