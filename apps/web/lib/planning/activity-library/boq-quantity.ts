// BOQ quantity provider - pure parts (Phase 3.2). The database access lives in boq-quantity-service.ts.
// A link ties a BOQ line to a metric of a WBS node with a share (factor). The provider's value for a node is the sum of
// (live BOQ quantity x factor); the reference string names every contributing line so the quantity is traceable.

import { normalizeUnit, sameUnit } from "../work-engine";

export interface BoqLinkRow {
  id: string;
  boq_source: "qs_boq" | "tender_boq";
  boq_item_id: string;
  boq_item_ref: string | null;
  boq_unit: string | null;
  boq_quantity_at_link: number | null;
  factor: number;
}

export interface BoqLiveItem {
  quantity: number;
  unit: string | null;
}

export interface BoqAggregate {
  value: number;
  unit: string | null;
  ref: string;
  /** lines whose current quantity differs from the quantity seen when the link was confirmed */
  drifted: string[];
  /** lines whose unit differs from the others (a mixed sum is meaningless) */
  unitConflict: boolean;
}

const key = (l: Pick<BoqLinkRow, "boq_source" | "boq_item_id">) => `${l.boq_source}:${l.boq_item_id}`;

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

/** Sum of live quantity x factor over the links of one node/metric. Falls back to the quantity stored at link time. */
export function aggregateBoqLinks(links: BoqLinkRow[], live: Map<string, BoqLiveItem>): BoqAggregate | null {
  if (links.length === 0) return null;
  let value = 0;
  let unit: string | null = null;
  let unitConflict = false;
  const parts: string[] = [];
  const drifted: string[] = [];
  for (const l of links) {
    const cur = live.get(key(l));
    const qty = cur?.quantity ?? l.boq_quantity_at_link ?? 0;
    const u = cur?.unit ?? l.boq_unit;
    if (unit == null) unit = u;
    else if (u != null && !sameUnit(unit, u)) unitConflict = true;
    value += qty * l.factor;
    const ref = l.boq_item_ref ?? l.boq_item_id.slice(0, 8);
    parts.push(l.factor === 1 ? `BOQ ${ref}` : `BOQ ${ref} x${fmt(l.factor)}`);
    if (cur && l.boq_quantity_at_link != null && Math.abs(cur.quantity - l.boq_quantity_at_link) > 1e-9) drifted.push(ref);
  }
  return { value: Math.round(value * 1000) / 1000, unit, ref: parts.join(" + "), drifted, unitConflict };
}

/** Equal share of one lump BOQ line for each of `n` levels. */
export function evenShare(n: number): number {
  return n > 0 ? Math.round((1 / n) * 1e9) / 1e9 : 1;
}

/** "L1-L10", "Level 1 to 10", "1F-9F" in a BOQ description -> number of levels it names, or null when it names none. */
export function levelRangeHint(description: string): number | null {
  const m = /\b(?:l|level\s*)?(\d{1,3})\s*f?\s*(?:-|to|–)\s*(?:l|level\s*)?(\d{1,3})\s*f?\b/i.exec(description);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return b >= a && b - a < 200 ? b - a + 1 : null;
}

/** Can this BOQ unit feed a metric measured in `metricUnit`? Unknown units on either side are allowed but flagged by callers. */
export function unitsCompatible(boqUnit: string | null, metricUnit: string | null): boolean {
  if (!boqUnit || !metricUnit) return true;
  return normalizeUnit(boqUnit) === normalizeUnit(metricUnit);
}

/** First and last level number named by a range in a BOQ description ("L1-L10" -> [1, 10]), or null. */
export function levelRangeBounds(description: string): [number, number] | null {
  const m = /\b(?:l|level\s*)?(\d{1,3})\s*f?\s*(?:-|to|\u2013)\s*(?:l|level\s*)?(\d{1,3})\s*f?\b/i.exec(description);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return b >= a && b - a < 200 ? [a, b] : null;
}

/** Number of a normal floor level from a WBS level name ("3F Floor", "Level 3", "03.3F") or null. */
export function floorNumber(levelName: string | null | undefined): number | null {
  if (!levelName) return null;
  const m = /(?:^|[^0-9])(\d{1,3})\s*f\b/i.exec(levelName) ?? /\blevel\s*(\d{1,3})\b/i.exec(levelName);
  return m ? Number(m[1]) : null;
}

/** Crude plural stripping so "slabs" matches "slab" in the name matcher (scoring only, never shown). */
export function singularise(text: string): string {
  return text.replace(/\b([a-z]{4,})s\b/gi, "$1");
}
