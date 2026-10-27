// Export rows for a published snapshot (Excel / CSV). The column mapping is documented in
// 04-20-01-08-API-Reference.md; values come only from the immutable snapshot.
import type { QtoSnapshot } from "./types";

export interface ExportColumn {
  key: string;
  header: string;
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "session_code", header: "Session" },
  { key: "version_no", header: "Version" },
  { key: "qto_no", header: "QTO No." },
  { key: "item_code", header: "Item code" },
  { key: "description", header: "Description" },
  { key: "work_section", header: "Work section" },
  { key: "element", header: "Element" },
  { key: "building", header: "Building" },
  { key: "level", header: "Level" },
  { key: "zone", header: "Zone" },
  { key: "discipline", header: "Discipline" },
  { key: "wbs_code", header: "WBS" },
  { key: "budget_code", header: "Budget code" },
  { key: "unit", header: "Unit" },
  { key: "gross_qty", header: "Gross" },
  { key: "deduction_qty", header: "Deductions" },
  { key: "factor_product", header: "Factor" },
  { key: "quantity", header: "Quantity" },
  { key: "quantity_status", header: "Status" },
  { key: "assumption_or_reason", header: "Assumption / exclusion reason" },
  { key: "factors", header: "Factors applied" },
  { key: "expression", header: "Formula" },
  { key: "engine_version", header: "Engine" },
  { key: "rule_code", header: "Rule" },
  { key: "drawing", header: "Drawing / revision" },
  { key: "page_no", header: "Page" },
  { key: "grid_location", header: "Grid" },
  { key: "carry_status", header: "Carry-forward" },
  { key: "ruleset", header: "Ruleset" },
  { key: "snapshot_hash", header: "Snapshot hash" },
];

export interface ExportLookups {
  wbsCodes?: Record<string, string>;
  budgetCodes?: Record<string, string>;
}

export type ExportRow = Record<string, string | number | null>;

export function buildExportRows(snapshot: QtoSnapshot, snapshotHash: string, lookups: ExportLookups = {}): ExportRow[] {
  const drawing = [snapshot.source.drawing_no, snapshot.source.revision && `Rev ${snapshot.source.revision}`]
    .filter(Boolean).join(" ");
  const ruleset = snapshot.ruleset.ruleset_code ? `${snapshot.ruleset.ruleset_code} v${snapshot.ruleset.version_no}` : null;
  return snapshot.items.map((i) => ({
    session_code: snapshot.session.code,
    version_no: snapshot.version.no,
    qto_no: i.qto_no,
    item_code: i.item_code,
    description: i.description,
    work_section: i.work_section,
    element: i.element,
    building: i.building,
    level: i.level,
    zone: i.zone,
    discipline: i.discipline,
    wbs_code: i.wbs_node_id ? lookups.wbsCodes?.[i.wbs_node_id] ?? i.wbs_node_id : null,
    budget_code: i.budget_code_id ? lookups.budgetCodes?.[i.budget_code_id] ?? i.budget_code_id : null,
    unit: i.unit,
    gross_qty: i.gross_qty,
    deduction_qty: i.deduction_qty,
    factor_product: i.factor_product,
    quantity: i.quantity,
    quantity_status: i.quantity_status,
    assumption_or_reason: i.quantity_status === "EXCLUDED" ? i.exclusion_reason : i.provisional_assumption,
    factors: i.factors.map((f) => `${f.name} ×${f.value}`).join("; ") || null,
    expression: i.calculation?.expression ?? null,
    engine_version: i.calculation?.engine_version ?? null,
    rule_code: i.rule_code,
    drawing: i.drawing_revision_id === snapshot.source.drawing_revision_id ? drawing : i.drawing_revision_id,
    page_no: i.page_no,
    grid_location: i.grid_location,
    carry_status: i.carry_status,
    ruleset,
    snapshot_hash: snapshotHash,
  }));
}

/** RFC 4180 CSV with a header row; values containing comma, quote or newline are quoted. */
export function toCsv(rows: ExportRow[], columns: ExportColumn[] = EXPORT_COLUMNS): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    // Text that a spreadsheet would run as a formula is prefixed with an apostrophe.
    const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
    return /[",\r\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c.key])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Rows as arrays in column order, for a worksheet. */
export function toSheetRows(rows: ExportRow[], columns: ExportColumn[] = EXPORT_COLUMNS): (string | number | null)[][] {
  return [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => r[c.key] ?? null))];
}
