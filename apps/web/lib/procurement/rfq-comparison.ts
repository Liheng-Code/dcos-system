// Pure RFQ quotation comparison and award-reason rules.
//
// No database or React imports. This mirrors the SQL function
// public.procurement_award_rfq (migrations 20261022101310_procurement_rfq_comparison.sql and
// 20261022150000_procurement_p2_sealed_bids_numbering.sql: override reason minimum is 50);
// keep the two in step: same coverage rule, same tie-breaks, same "why" strings.
// A null evaluation_method is treated as lowest_price, as in the RPC.

export type QuoteCountException = "fewer_than_3_quotes" | "single_source";

export interface ComparisonPrLine {
  id: string;
  line_no: number;
  item_code: string | null;
  item_description: string | null;
  unit: string | null;
  quantity: number;
}

export interface ComparisonQuotationItem {
  id: string;
  pr_item_id: string | null;
  line_no: number;
  item_code: string | null;
  item_description: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  delivery_date: string | null;
  lead_time_days: number | null;
  notes: string | null;
}

export interface ComparisonQuotationInput {
  id: string;
  supplier_id: string;
  supplier_name: string;
  currency: string;
  total_amount: number | null;
  valid_until: string | null;
  delivery_lead_time: number | null;
  received_at: string | null;
  combined_score: number | null;
  status: string;
  is_awarded: boolean;
  items: ComparisonQuotationItem[];
}

export interface RfqComparisonCell {
  unitPrice: number;
  total: number;
  quantity: number;
  leadTimeDays: number | null;
  deliveryDate: string | null;
  notes: string | null;
  isLowest: boolean;
  qtyMismatch: boolean;
  lineTotalMismatch: boolean;
}

export interface RfqComparisonLine {
  key: string;
  prItemId: string | null;
  lineNo: number;
  description: string;
  unit: string | null;
  quantity: number;
  cells: Record<string, RfqComparisonCell | null>;
  lowestUnitPrice: number | null;
  lowestQuotationIds: string[];
}

export interface RfqComparisonSupplier {
  quotationId: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  comparable: boolean;
  expired: boolean;
  expiringSoon: boolean;
  fullCoverage: boolean;
  coveredLines: number;
  totalLines: number;
  compareTotal: number;
  headerTotal: number | null;
  totalMismatch: boolean;
  leadTimeDays: number | null;
  combinedScore: number | null;
  eligible: boolean;
  rank: number | null;
  isAwarded: boolean;
}

export interface RfqComparison {
  baseCurrency: string | null;
  lines: RfqComparisonLine[];
  suppliers: RfqComparisonSupplier[];
  recommendedQuotationId: string | null;
  quoteCountException: QuoteCountException | null;
}

export interface BuildRfqComparisonInput {
  evaluationMethod: string | null;
  prLines: ComparisonPrLine[];
  quotations: ComparisonQuotationInput[];
  /** Today as YYYY-MM-DD. */
  today: string;
  /**
   * Keep quotations with status "rejected". Set once the RFQ is awarded: the award marks
   * every losing quotation rejected, and the grid must still show what was compared.
   */
  includeRejected?: boolean;
}

const MONEY_TOLERANCE = 0.01;
const EXPIRING_SOON_DAYS = 7;

export const REASON_WHY = {
  override: "it differs from the system recommendation",
  currency: "the quotation is not in the base currency",
  coverage: "the quotation does not cover every line",
  fewerThan3: "fewer than 3 valid quotations were received",
  singleSource: "only one valid quotation was received (single source)",
} as const;

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}

function timeOf(v: string | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Ascending compare with nulls last. */
function cmpNullsLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function cmpId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildRfqComparison(input: BuildRfqComparisonInput): RfqComparison {
  const { prLines, today } = input;
  const method = input.evaluationMethod ?? "lowest_price";
  const quotes = input.includeRejected
    ? input.quotations
    : input.quotations.filter((q) => q.status !== "rejected");
  const todayN = dayNumber(today);
  const hasPr = prLines.length > 0;

  // Base currency: most common, tie -> alphabetical first.
  const currencyCounts = new Map<string, number>();
  for (const q of quotes) currencyCounts.set(q.currency, (currencyCounts.get(q.currency) ?? 0) + 1);
  let baseCurrency: string | null = null;
  let bestCount = -1;
  for (const [cur, count] of [...currencyCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (count > bestCount) {
      baseCurrency = cur;
      bestCount = count;
    }
  }

  // Line skeletons.
  const prById = new Map(prLines.map((l) => [l.id, l]));
  const lines: RfqComparisonLine[] = [];
  const lineByKey = new Map<string, RfqComparisonLine>();
  const keyOf = (item: ComparisonQuotationItem): string | null =>
    hasPr ? (item.pr_item_id && prById.has(item.pr_item_id) ? item.pr_item_id : null) : String(item.line_no);

  if (hasPr) {
    for (const p of [...prLines].sort((a, b) => a.line_no - b.line_no)) {
      const line: RfqComparisonLine = {
        key: p.id,
        prItemId: p.id,
        lineNo: p.line_no,
        description: p.item_description ?? p.item_code ?? "",
        unit: p.unit,
        quantity: num(p.quantity),
        cells: {},
        lowestUnitPrice: null,
        lowestQuotationIds: [],
      };
      lines.push(line);
      lineByKey.set(line.key, line);
    }
  } else {
    // Fallback: lines keyed by line_no, only those priced by at least one quotation.
    const items = quotes
      .flatMap((q) => q.items)
      .filter((i) => num(i.unit_price) > 0)
      .sort((a, b) => a.line_no - b.line_no);
    for (const i of items) {
      const key = String(i.line_no);
      if (lineByKey.has(key)) continue;
      const line: RfqComparisonLine = {
        key,
        prItemId: null,
        lineNo: i.line_no,
        description: i.item_description ?? i.item_code ?? "",
        unit: i.unit,
        quantity: num(i.quantity),
        cells: {},
        lowestUnitPrice: null,
        lowestQuotationIds: [],
      };
      lines.push(line);
      lineByKey.set(key, line);
    }
  }
  const totalLines = lines.length;

  // Per-quotation cells and stats.
  type Stat = RfqComparisonSupplier & { receivedMs: number | null };
  const stats: Stat[] = quotes.map((q) => {
    const covered = new Set<string>();
    for (const line of lines) line.cells[q.id] = null;
    for (const item of q.items) {
      if (num(item.unit_price) <= 0) continue;
      const key = keyOf(item);
      if (key === null) continue;
      const line = lineByKey.get(key);
      if (!line) continue;
      if (covered.has(key)) continue; // first covering line wins; duplicates do not double count
      covered.add(key);
      const unitPrice = num(item.unit_price);
      const total = num(item.total);
      const quantity = num(item.quantity);
      line.cells[q.id] = {
        unitPrice,
        total,
        quantity,
        leadTimeDays: item.lead_time_days ?? null,
        deliveryDate: item.delivery_date ?? null,
        notes: item.notes ?? null,
        isLowest: false,
        qtyMismatch: hasPr ? quantity !== line.quantity : false,
        lineTotalMismatch: roundMoney(Math.abs(total - quantity * unitPrice)) > MONEY_TOLERANCE,
      };
    }

    const compareTotal = roundMoney(q.items.reduce((s, i) => s + num(i.total), 0));
    const headerTotal = q.total_amount === null || q.total_amount === undefined ? null : num(q.total_amount);
    const expired = q.valid_until !== null && dayNumber(q.valid_until) < todayN;
    const expiringSoon =
      q.valid_until !== null && !expired && dayNumber(q.valid_until) - todayN <= EXPIRING_SOON_DAYS;
    const comparable = q.currency === baseCurrency;
    const fullCoverage = totalLines > 0 && covered.size >= totalLines;
    const combinedScore =
      q.combined_score === null || q.combined_score === undefined ? null : num(q.combined_score);
    const eligible =
      comparable && !expired && fullCoverage && (method === "lowest_price" || combinedScore !== null);

    return {
      quotationId: q.id,
      supplierId: q.supplier_id,
      supplierName: q.supplier_name,
      currency: q.currency,
      comparable,
      expired,
      expiringSoon,
      fullCoverage,
      coveredLines: covered.size,
      totalLines,
      compareTotal,
      headerTotal,
      totalMismatch: headerTotal !== null && roundMoney(Math.abs(compareTotal - headerTotal)) > MONEY_TOLERANCE,
      leadTimeDays: q.delivery_lead_time ?? null,
      combinedScore,
      eligible,
      rank: null,
      isAwarded: q.is_awarded,
      receivedMs: timeOf(q.received_at),
    };
  });

  // Lowest per line among comparable quotations; ties all highlighted.
  const comparableIds = new Set(stats.filter((s) => s.comparable).map((s) => s.quotationId));
  for (const line of lines) {
    let lowest: number | null = null;
    for (const [qid, cell] of Object.entries(line.cells)) {
      if (!cell || !comparableIds.has(qid)) continue;
      if (lowest === null || cell.unitPrice < lowest) lowest = cell.unitPrice;
    }
    line.lowestUnitPrice = lowest;
    if (lowest === null) continue;
    for (const [qid, cell] of Object.entries(line.cells)) {
      if (cell && comparableIds.has(qid) && cell.unitPrice === lowest) {
        cell.isLowest = true;
        line.lowestQuotationIds.push(qid);
      }
    }
  }

  // Ranking of eligible quotations (rank 1 = recommended).
  const byLead = (a: Stat, b: Stat) =>
    cmpNullsLast(a.leadTimeDays, b.leadTimeDays) || cmpNullsLast(a.receivedMs, b.receivedMs) || cmpId(a.quotationId, b.quotationId);
  const ranked = stats
    .filter((s) => s.eligible)
    .sort((a, b) => {
      if (method === "lowest_price") return a.compareTotal - b.compareTotal || byLead(a, b);
      return (
        (b.combinedScore ?? 0) - (a.combinedScore ?? 0) || a.compareTotal - b.compareTotal || byLead(a, b)
      );
    });
  ranked.forEach((s, i) => {
    s.rank = i + 1;
  });

  const validCount = quotes.filter((q) => !(q.valid_until !== null && dayNumber(q.valid_until) < todayN)).length;
  const quoteCountException: QuoteCountException | null =
    validCount === 1 ? "single_source" : validCount === 2 ? "fewer_than_3_quotes" : null;

  return {
    baseCurrency,
    lines,
    suppliers: stats.map((s) => {
      const { receivedMs: _receivedMs, ...rest } = s;
      void _receivedMs;
      return rest;
    }),
    recommendedQuotationId: ranked[0]?.quotationId ?? null,
    quoteCountException,
  };
}

/** Minimum award-reason length for a chosen quotation, with the reasons it is required (RPC step 6). */
export function requiredReasonLength(args: {
  comparison: RfqComparison;
  quotationId: string;
}): { min: number; why: string[] } {
  const { comparison, quotationId } = args;
  const chosen = comparison.suppliers.find((s) => s.quotationId === quotationId);
  let min = 1;
  const why: string[] = [];
  const need = (n: number, reason: string) => {
    min = Math.max(min, n);
    why.push(reason);
  };

  if (comparison.recommendedQuotationId === null || comparison.recommendedQuotationId !== quotationId) {
    need(50, REASON_WHY.override);
  }
  if (chosen && !chosen.comparable) need(20, REASON_WHY.currency);
  if (chosen && !chosen.fullCoverage) need(20, REASON_WHY.coverage);
  if (comparison.quoteCountException === "fewer_than_3_quotes") need(20, REASON_WHY.fewerThan3);
  else if (comparison.quoteCountException === "single_source") need(50, REASON_WHY.singleSource);

  return { min, why };
}

export const MAX_AWARD_REASON_LENGTH = 2000;
