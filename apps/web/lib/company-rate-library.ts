import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompanyLibraryRate {
  id: string;
  tenant_id: string;
  code: string;
  description: string;
  trade: string | null;
  discipline: string | null;
  unit: string;
  mode: "flat" | "buildup";
  base_rate: number | null;
  wastage_pct: number;
  productivity_factor: number;
  net_rate: number;
  category_tags: string[] | null;
  region: string | null;
  source_project_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyLibraryRateLine {
  id: string;
  tenant_id: string;
  library_rate_id: string;
  category: "material" | "labor" | "plant" | "subcon";
  price_list_item_code: string | null;
  price_list_item_desc: string;
  unit_price: number;
  qty_per_unit: number;
  wastage_pct: number;
  line_total: number;
  sort_order: number;
}

export interface CompanyLibraryRateWithLines extends CompanyLibraryRate {
  lines: CompanyLibraryRateLine[];
}

// ── List / Read ──────────────────────────────────────────────────────────────

export async function getLibraryRates(filters?: {
  trade?: string;
  discipline?: string;
  mode?: "flat" | "buildup";
  search?: string;
}): Promise<CompanyLibraryRate[]> {
  let query = createClient()
    .from("company_rate_library")
    .select("*")
    .eq("is_active", true)
    .order("discipline")
    .order("trade")
    .order("code");

  if (filters?.discipline) query = query.eq("discipline", filters.discipline);
  if (filters?.trade) query = query.eq("trade", filters.trade);
  if (filters?.mode) query = query.eq("mode", filters.mode);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    query = query.or(`code.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyLibraryRate[];
}

export async function getLibraryRate(id: string): Promise<CompanyLibraryRateWithLines> {
  const { data: rate, error: rateErr } = await createClient()
    .from("company_rate_library")
    .select("*")
    .eq("id", id)
    .single();
  if (rateErr) throw new Error(rateErr.message);

  const { data: lines, error: linesErr } = await createClient()
    .from("company_rate_library_lines")
    .select("*")
    .eq("library_rate_id", id)
    .order("sort_order");
  if (linesErr) throw new Error(linesErr.message);

  return { ...(rate as CompanyLibraryRate), lines: (lines ?? []) as CompanyLibraryRateLine[] };
}

export async function getLibraryRateUsageCount(id: string): Promise<number> {
  const { count, error } = await createClient()
    .from("tender_unit_rates")
    .select("*", { count: "exact", head: true })
    .eq("library_rate_id", id);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createLibraryRate(
  rate: Omit<CompanyLibraryRate, "id" | "net_rate" | "created_at" | "updated_at" | "created_by">,
  lines: Omit<CompanyLibraryRateLine, "id" | "tenant_id" | "library_rate_id" | "line_total">[],
): Promise<CompanyLibraryRate> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: created, error: rateErr } = await supabase
    .from("company_rate_library")
    .insert({ ...rate, created_by: user?.id ?? null })
    .select("*")
    .single();
  if (rateErr) throw new Error(rateErr.message);

  if (lines.length > 0) {
    const lineRows = lines.map((l, i) => ({
      tenant_id: rate.tenant_id,
      library_rate_id: created.id,
      category: l.category,
      price_list_item_code: l.price_list_item_code ?? null,
      price_list_item_desc: l.price_list_item_desc,
      unit_price: l.unit_price,
      qty_per_unit: l.qty_per_unit,
      wastage_pct: l.wastage_pct ?? 0,
      line_total: 0,
      sort_order: l.sort_order ?? i,
    }));
    const { error: linesErr } = await supabase.from("company_rate_library_lines").insert(lineRows);
    if (linesErr) throw new Error(linesErr.message);
  }

  return created as CompanyLibraryRate;
}

// ── Update ───────────────────────────────────────────────────────────────────

export async function updateLibraryRate(
  id: string,
  rate: Partial<Omit<CompanyLibraryRate, "id" | "net_rate" | "created_at" | "updated_at" | "created_by">>,
  lines?: Omit<CompanyLibraryRateLine, "id" | "tenant_id" | "library_rate_id" | "line_total">[],
): Promise<CompanyLibraryRate> {
  const supabase = createClient();

  const { data: updated, error: rateErr } = await supabase
    .from("company_rate_library")
    .update({ ...rate, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (rateErr) throw new Error(rateErr.message);

  if (lines !== undefined) {
    await supabase.from("company_rate_library_lines").delete().eq("library_rate_id", id);
    if (lines.length > 0) {
      const lineRows = lines.map((l, i) => ({
        tenant_id: rate.tenant_id ?? updated.tenant_id,
        library_rate_id: id,
        category: l.category,
        price_list_item_code: l.price_list_item_code ?? null,
        price_list_item_desc: l.price_list_item_desc,
        unit_price: l.unit_price,
        qty_per_unit: l.qty_per_unit,
        wastage_pct: l.wastage_pct ?? 0,
        line_total: 0,
        sort_order: l.sort_order ?? i,
      }));
      const { error: linesErr } = await supabase.from("company_rate_library_lines").insert(lineRows);
      if (linesErr) throw new Error(linesErr.message);
    }
  }

  return updated as CompanyLibraryRate;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteLibraryRate(id: string): Promise<void> {
  const { error } = await createClient().from("company_rate_library").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Import from Library → Tender ─────────────────────────────────────────────

export async function importFromLibrary(
  libraryRateId: string,
  tenderId: string,
): Promise<{ id: string }> {
  const supabase = createClient();

  // 1. Fetch library rate + lines
  const libRate = await getLibraryRate(libraryRateId);

  // 2. Create tender unit rate
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tenderRate, error: rateErr } = await supabase
    .from("tender_unit_rates")
    .insert({
      tenant_id: libRate.tenant_id,
      tender_id: tenderId,
      code: libRate.code.replace(/^LIB-/, "UR-"),
      description: libRate.description,
      trade: libRate.trade,
      discipline: libRate.discipline,
      unit: libRate.unit,
      mode: libRate.mode,
      base_rate: libRate.base_rate,
      wastage_pct: libRate.wastage_pct,
      productivity_factor: libRate.productivity_factor,
      net_rate: libRate.net_rate,
      library_rate_id: libraryRateId,
      is_active: true,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (rateErr) throw new Error(rateErr.message);

  // 3. Copy lines
  if (libRate.lines.length > 0) {
    const lineRows = libRate.lines.map((l) => ({
      tenant_id: libRate.tenant_id,
      unit_rate_id: tenderRate.id,
      category: l.category,
      price_list_item_id: null,
      qty_per_unit: l.qty_per_unit,
      wastage_pct: l.wastage_pct,
      line_total: l.line_total,
      sort_order: l.sort_order,
    }));
    const { error: linesErr } = await supabase.from("tender_unit_rate_lines").insert(lineRows);
    if (linesErr) throw new Error(linesErr.message);
  }

  return { id: tenderRate.id };
}

// ── Save Tender Rate → Library ───────────────────────────────────────────────

export async function saveToLibrary(
  tenderRateId: string,
): Promise<{ id: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Fetch tender rate
  const { data: tenderRate, error: rateErr } = await supabase
    .from("tender_unit_rates")
    .select("*")
    .eq("id", tenderRateId)
    .single();
  if (rateErr) throw new Error(rateErr.message);

  // 2. Fetch tender rate lines
  const { data: tenderLines, error: linesErr } = await supabase
    .from("tender_unit_rate_lines")
    .select("*")
    .eq("unit_rate_id", tenderRateId)
    .order("sort_order");
  if (linesErr) throw new Error(linesErr.message);

  // 3. Create library rate
  const libCode = (tenderRate.code as string).replace(/^UR-/, "LIB-");
  const { data: libRate, error: libErr } = await supabase
    .from("company_rate_library")
    .insert({
      tenant_id: tenderRate.tenant_id,
      code: libCode,
      description: tenderRate.description,
      trade: tenderRate.trade,
      discipline: null,
      unit: tenderRate.unit,
      mode: tenderRate.mode,
      base_rate: tenderRate.base_rate,
      wastage_pct: tenderRate.wastage_pct,
      productivity_factor: tenderRate.productivity_factor,
      net_rate: tenderRate.net_rate,
      is_active: true,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (libErr) throw new Error(libErr.message);

  // 4. Copy lines
  if (tenderLines && tenderLines.length > 0) {
    const lineRows = tenderLines.map((l) => ({
      tenant_id: tenderRate.tenant_id,
      library_rate_id: libRate.id,
      category: l.category,
      price_list_item_code: null,
      price_list_item_desc: `Price item ${l.price_list_item_id}`,
      unit_price: 0,
      qty_per_unit: l.qty_per_unit,
      wastage_pct: l.wastage_pct,
      line_total: l.line_total,
      sort_order: l.sort_order,
    }));
    const { error: copyErr } = await supabase.from("company_rate_library_lines").insert(lineRows);
    if (copyErr) throw new Error(copyErr.message);
  }

  // 5. Link tender rate to library
  await supabase
    .from("tender_unit_rates")
    .update({ library_rate_id: libRate.id })
    .eq("id", tenderRateId);

  return { id: libRate.id };
}
