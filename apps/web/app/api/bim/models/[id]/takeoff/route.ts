import { NextRequest, NextResponse } from "next/server";
import { createUserClient, createAdminClient } from "@/lib/supabase/server";
import {
  resolveTenantId,
  bulkUpsertElementTakeoff,
  pruneNonElementTakeoff,
  listElementTakeoff,
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
    const elements = await listElementTakeoff(supabase, tenantId, id);
    return NextResponse.json({ data: elements });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] GET /models/:id/takeoff:", err);
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
  const { elements, prune } = body;
  if (prune !== true && (!Array.isArray(elements) || elements.length === 0)) {
    return NextResponse.json(
      { error: "elements array is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = await resolveTenantId(supabase, user.id);

  try {
    // prune: true removes the non-element rows of an older extraction (never one that a BOQ promotion uses); it may be sent
    // alone, after the last batch of elements.
    const count = Array.isArray(elements) && elements.length > 0
      ? await bulkUpsertElementTakeoff(supabase, tenantId, id, elements, user.id)
      : 0;
    const pruned = prune === true ? await pruneNonElementTakeoff(supabase, tenantId, id) : 0;
    return NextResponse.json({ data: { extracted: count, pruned } }, { status: 201 });
  } catch (err) {
    if (err instanceof BimError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    console.error("[BIM] POST /models/:id/takeoff:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
