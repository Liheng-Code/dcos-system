// Pure helpers for BOQ item alternates (memo-only alternate rate build-ups).
// No Supabase imports: unit-tested in __tests__/boq-alternates.test.ts.

export interface TenderBoqItemAlternate {
  id: string;
  tender_id: string;
  boq_item_id: string;
  alt_no: number;
  description: string;
  notes: string | null;
  labor_net_cost: number;
  labor_margin_pct: number;
  material_net_cost: number;
  material_margin_pct: number;
  unit_rate: number;
  is_manual_rate: boolean;
  rate_source: string;
  dwl_work_item_id: string | null;
  dwl_assembly_id: string | null;
  price_list_item_id: string | null;
  source_cost_db_item_id: string | null;
  rate_build_up: unknown;
  brand: string | null;
  supplier: string | null;
  material_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** quantity x rate, rounded to 2 dp (same path as base total_amount). */
export function alternateAmount(quantity: number, unitRate: number): number {
  return round2(quantity * unitRate);
}

/** Alt amount - base amount (positive = Add, negative = Omit). */
export function alternateDelta(quantity: number, altRate: number, baseAmount: number): number {
  return round2(alternateAmount(quantity, altRate) - baseAmount);
}

export interface AlternateSummaryRow {
  altNo: number;
  lines: number;
  value: number;
  delta: number;
}

/**
 * Memo summary grouped by alt_no, ascending. Only alternates whose boq_item_id
 * is in `items` are counted (so it follows UI filters).
 */
export function summarizeAlternates(
  items: { id: string; quantity: number; total_amount: number | null }[],
  alternates: TenderBoqItemAlternate[]
): AlternateSummaryRow[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<number, AlternateSummaryRow>();
  for (const alt of alternates) {
    const item = byId.get(alt.boq_item_id);
    if (!item) continue;
    const amount = alternateAmount(Number(item.quantity), Number(alt.unit_rate));
    const base = Number(item.total_amount ?? 0);
    const row = groups.get(alt.alt_no) ?? { altNo: alt.alt_no, lines: 0, value: 0, delta: 0 };
    row.lines += 1;
    row.value += amount;
    row.delta += amount - base;
    groups.set(alt.alt_no, row);
  }
  return [...groups.values()]
    .sort((a, b) => a.altNo - b.altNo)
    .map((r) => ({ ...r, value: round2(r.value), delta: round2(r.delta) }));
}

/** Next alt_no for an item = max existing + 1 (1 if none). */
export function nextAltNo(alternates: TenderBoqItemAlternate[], boqItemId: string): number {
  let max = 0;
  for (const a of alternates) {
    if (a.boq_item_id === boqItemId && a.alt_no > max) max = a.alt_no;
  }
  return max + 1;
}

/** Map boq_item_id -> its alternates sorted by alt_no. */
export function groupAlternatesByItem(alternates: TenderBoqItemAlternate[]): Map<string, TenderBoqItemAlternate[]> {
  const map = new Map<string, TenderBoqItemAlternate[]>();
  for (const a of alternates) {
    const list = map.get(a.boq_item_id);
    if (list) list.push(a);
    else map.set(a.boq_item_id, [a]);
  }
  for (const list of map.values()) list.sort((a, b) => a.alt_no - b.alt_no);
  return map;
}
