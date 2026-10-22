/**
 * /api/libraries/[sector] – full CRUD for the cost_libraries table.
 *
 * Sectors correspond to the CHECK constraint in the cost_libraries migration:
 *   Residential | Commercial | Industrial | Institutional | Infrastructure
 *
 * Auth: uses the user's session cookie (createUserClient). All writes require
 * an authenticated session; RLS policies on the table enforce additional role
 * checks (quantity_surveyor) for mutations.
 */
import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise sector slug to the DB enum value (title-case). */
function normaliseSector(raw: string): string {
  const map: Record<string, string> = {
    residential: "Residential",
    commercial: "Commercial",
    industrial: "Industrial",
    institutional: "Institutional",
    infrastructure: "Infrastructure",
    prelim: "Residential", // prelim maps to Residential; extend as needed
  };
  return map[raw.toLowerCase()] ?? raw;
}

async function getAuthenticatedClient() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── GET /api/libraries/[sector] ───────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: rawSector } = await params;
  const sector = normaliseSector(rawSector);

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("cost_libraries")
    .select("*")
    .eq("sector", sector)
    .order("name");

  if (error) {
    console.error("[libraries/GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map DB snake_case → camelCase expected by the front-end
  const items = (data ?? []).map(dbRowToItem);
  return NextResponse.json(items);
}

// ── POST /api/libraries/[sector] – create a new item ─────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: rawSector } = await params;
  const sector = normaliseSector(rawSector);

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cost_libraries")
    .insert([itemToDbRow(body, sector)])
    .select()
    .single();

  if (error) {
    console.error("[libraries/POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(dbRowToItem(data), { status: 201 });
}

// ── PUT /api/libraries/[sector] – update an existing item ─────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: rawSector } = await params;
  const sector = normaliseSector(rawSector);

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: "Item id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cost_libraries")
    .update(itemToDbRow(body, sector))
    .eq("id", id)
    .eq("sector", sector)
    .select()
    .single();

  if (error) {
    console.error("[libraries/PUT]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(dbRowToItem(data));
}

// ── DELETE /api/libraries/[sector] – remove an item ──────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sector: string }> }
) {
  const { sector: rawSector } = await params;
  const sector = normaliseSector(rawSector);

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: "Item id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cost_libraries")
    .delete()
    .eq("id", id)
    .eq("sector", sector);

  if (error) {
    console.error("[libraries/DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

/**
 * Convert a front-end item (camelCase) to a DB row (snake_case).
 * Unknown extra fields are ignored.
 */
function itemToDbRow(item: Record<string, unknown>, sector: string) {
  return {
    sector,
    name: item.name as string,
    description: (item.description as string | undefined) ?? null,
    unit: (item.unit as string | undefined) ?? null,
    currency: (item.currency as string | undefined) ?? "USD",
    price: Number(item.price ?? 0),
    effective_date: (item.effectiveDate as string | undefined) ?? null,
    source: (item.source as string | undefined) ?? null,
    material_type: (item.materialType as string | undefined) ?? null,
    grade: (item.grade as string | undefined) ?? null,
    specifications: (item.specifications as string | undefined) ?? null,
    activity_code: (item.activityCode as string | undefined) ?? null,
    labor_factor: item.laborFactor != null ? Number(item.laborFactor) : null,
  };
}

/** Convert a DB row (snake_case) back to the front-end shape (camelCase). */
function dbRowToItem(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    sector: row.sector as string,
    name: row.name as string,
    description: row.description ?? undefined,
    unit: row.unit ?? undefined,
    currency: row.currency as string,
    price: Number(row.price),
    effectiveDate: row.effective_date ?? undefined,
    source: row.source ?? undefined,
    materialType: row.material_type ?? undefined,
    grade: row.grade ?? undefined,
    specifications: row.specifications ?? undefined,
    activityCode: row.activity_code ?? undefined,
    laborFactor: row.labor_factor != null ? Number(row.labor_factor) : undefined,
  };
}
