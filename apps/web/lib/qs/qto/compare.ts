// Revision comparison between two versions of a session (Master Plan §12.2).
// Items match by carried-forward lineage first, then by QTO number. A previous item that several
// new items claim is an unresolved match and is shown for human review.
import { type Dec, cmp, dec, div, isZero, mul, round, sub, toFixedString } from "./decimal";

export type ChangeKind =
  | "added"
  | "removed"
  | "increased"
  | "decreased"
  | "unchanged"
  | "modified"
  | "rule_changed"
  | "source_changed"
  | "unresolved";

export interface ComparableItem {
  id: string;
  qto_no: string;
  description: string;
  unit: string;
  quantity: number | string;
  quantity_status?: string | null;
  work_section?: string | null;
  building?: string | null;
  level?: string | null;
  zone?: string | null;
  wbs_node_id?: string | null;
  budget_code_id?: string | null;
  rule_code?: string | null;
  drawing_revision_id?: string | null;
  carried_from_item_id?: string | null;
}

export interface ChangeRow {
  key: string;
  kind: ChangeKind;
  /** Secondary changes found alongside the main kind (e.g. an increase that also changed rule). */
  also: ChangeKind[];
  previous: ComparableItem | null;
  current: ComparableItem | null;
  previousQty: string | null;
  currentQty: string | null;
  /** current − previous, in the item unit. */
  variance: string | null;
  /** Percentage of the previous quantity, 2 dp; null when the previous quantity is 0 or missing. */
  variancePct: string | null;
  unitChanged: boolean;
}

const q = (v: number | string): Dec => dec(String(v));

function classificationKey(i: ComparableItem): string {
  return [i.description, i.quantity_status, i.work_section, i.building, i.level, i.zone, i.wbs_node_id, i.budget_code_id]
    .map((s) => (s ?? "").toString().trim()).join("|");
}

export function compareItems(previous: ComparableItem[], current: ComparableItem[]): ChangeRow[] {
  const prevById = new Map(previous.map((p) => [p.id, p]));
  const prevByNo = new Map(previous.map((p) => [p.qto_no, p]));
  const claims = new Map<string, ComparableItem[]>();
  const matchOf = new Map<string, ComparableItem | null>();

  for (const c of current) {
    const m = (c.carried_from_item_id && prevById.get(c.carried_from_item_id)) || prevByNo.get(c.qto_no) || null;
    matchOf.set(c.id, m);
    if (m) claims.set(m.id, [...(claims.get(m.id) ?? []), c]);
  }

  const rows: ChangeRow[] = [];
  for (const c of current) {
    const p = matchOf.get(c.id) ?? null;
    if (!p) {
      rows.push(row("added", c.qto_no, null, c));
      continue;
    }
    if ((claims.get(p.id)?.length ?? 0) > 1) {
      rows.push(row("unresolved", `${p.qto_no}→${c.qto_no}`, p, c));
      continue;
    }
    const also: ChangeKind[] = [];
    if ((p.rule_code ?? "") !== (c.rule_code ?? "")) also.push("rule_changed");
    if ((p.drawing_revision_id ?? "") !== (c.drawing_revision_id ?? "")) also.push("source_changed");
    if (classificationKey(p) !== classificationKey(c)) also.push("modified");
    const d = p.unit === c.unit ? cmp(q(c.quantity), q(p.quantity)) : 0;
    const kind: ChangeKind = p.unit !== c.unit ? "modified"
      : d > 0 ? "increased" : d < 0 ? "decreased" : also[0] ?? "unchanged";
    rows.push(row(kind, c.qto_no, p, c, also.filter((k) => k !== kind)));
  }
  const claimed = new Set([...claims.keys()]);
  for (const p of previous) if (!claimed.has(p.id)) rows.push(row("removed", p.qto_no, p, null));
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

function row(kind: ChangeKind, key: string, p: ComparableItem | null, c: ComparableItem | null, also: ChangeKind[] = []): ChangeRow {
  const prevQty = p ? q(p.quantity) : null;
  const curQty = c ? q(c.quantity) : null;
  const unitChanged = !!(p && c && p.unit !== c.unit);
  let variance: Dec | null = null;
  let pct: string | null = null;
  if (!unitChanged) {
    const a = prevQty ?? dec(0);
    const b = curQty ?? dec(0);
    variance = sub(b, a);
    if (prevQty !== null && !isZero(prevQty)) pct = toFixedString(round(mul(div(variance, prevQty), dec(100)), 2), 2);
  }
  return {
    key, kind, also, previous: p, current: c,
    previousQty: prevQty === null ? null : toFixedString(prevQty),
    currentQty: curQty === null ? null : toFixedString(curQty),
    variance: variance === null ? null : toFixedString(variance),
    variancePct: pct,
    unitChanged,
  };
}

export function summarizeChanges(rows: ChangeRow[]): Record<ChangeKind, number> {
  const out = { added: 0, removed: 0, increased: 0, decreased: 0, unchanged: 0, modified: 0, rule_changed: 0, source_changed: 0, unresolved: 0 };
  for (const r of rows) out[r.kind]++;
  return out;
}

export const CHANGE_LABEL: Record<ChangeKind, string> = {
  added: "Added",
  removed: "Removed",
  increased: "Increased",
  decreased: "Decreased",
  unchanged: "Unchanged",
  modified: "Description / classification changed",
  rule_changed: "Calculation rule changed",
  source_changed: "Source evidence changed",
  unresolved: "Unresolved match",
};
