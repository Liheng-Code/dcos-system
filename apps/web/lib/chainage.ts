// Chainage (linear position along a road, pipeline or utility route, in metres from its start).
// Phase E of the "Activity Library by Sector" plan. Pure, no I/O; core (used by the WBS builder and planning).
//
// A route is a WBS node; its chainage sections are "segment" nodes with chainage_from_m / chainage_to_m.
// BOQ lines need no new field: a location label such as "CH 0+000 - 1+500" is read as a range, and its
// quantity is shared over the sections it overlaps, in proportion to the overlap.

export interface ChainageRange {
  from: number;
  to: number;
}

/** "1+250.5" -> 1250.5; "1250" -> 1250; "1.25 km" -> 1250. Null when not a chainage. */
export function parseChainagePoint(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/^(ch|km|sta)\.?\s*/, "").replace(/\s+/g, "");
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)\+(\d{1,3}(?:\.\d+)?)$/.exec(t))) return Number(m[1]) * 1000 + Number(m[2]);
  if ((m = /^(\d+(?:\.\d+)?)km$/.exec(t))) return Math.round(Number(m[1]) * 1000 * 1000) / 1000;
  if ((m = /^(\d+(?:\.\d+)?)m?$/.exec(t))) return Number(m[1]);
  return null;
}

/**
 * A chainage range from a location label: "CH 0+000 - 1+500", "0+000 to 1+500", "KM 0-1.5",
 * "1+000~2+000". Needs a "+" or a CH / KM marker so plain level labels ("1F", "02") are never read as one.
 */
export function parseChainageRange(label: string | null | undefined): ChainageRange | null {
  if (!label) return null;
  const t = label.trim();
  const isKm = /^km\b/i.test(t);
  if (!/\+/.test(t) && !/^(ch|km|sta)\b/i.test(t)) return null;
  const body = t.replace(/^(ch|km|sta)\.?\s*/i, "");
  // chainage points never contain a dash, so any dash / tilde / "to" separates the two ends
  const parts = body.split(/\s*(?:–|—|~|-|\bto\b)\s*/i).filter(Boolean);
  if (parts.length !== 2) return null;
  const read = (p: string) => (isKm && !p.includes("+") ? parseChainagePoint(`${p}km`) : parseChainagePoint(p));
  const a = read(parts[0]);
  const b = read(parts[1]);
  if (a == null || b == null || a === b) return null;
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** 1250 -> "1+250"; 1250.5 -> "1+250.5". */
export function formatChainage(m: number): string {
  const km = Math.floor(m / 1000);
  const rest = Math.round((m - km * 1000) * 1000) / 1000;
  const [i, d] = String(rest).split(".");
  return `${km}+${i.padStart(3, "0")}${d ? `.${d}` : ""}`;
}

export const formatRange = (r: ChainageRange) => `CH ${formatChainage(r.from)} – ${formatChainage(r.to)}`;

export interface PlannedSegment extends ChainageRange {
  code: string;
  name: string;
}

/** Equal sections from start to end (the last one may be shorter). Codes S01, S02, ... continue after `startIndex`. */
export function buildSegments(start: number, end: number, interval: number, startIndex = 0): PlannedSegment[] {
  if (!(end > start) || !(interval > 0)) return [];
  const out: PlannedSegment[] = [];
  let from = start;
  let i = startIndex;
  while (from < end - 1e-9 && out.length < 500) {
    const to = Math.min(end, from + interval);
    i += 1;
    out.push({ code: `S${String(i).padStart(2, "0")}`, name: formatRange({ from, to }), from, to });
    from = to;
  }
  return out;
}

const overlap = (a: ChainageRange, b: ChainageRange) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));

/** Share of a range that falls in each section (by overlap length). Sections the range misses are left out. */
export function overlapShares<T extends ChainageRange & { id: string }>(range: ChainageRange, sections: T[]): { id: string; share: number }[] {
  const len = range.to - range.from;
  if (!(len > 0)) return [];
  return sections
    .map((s) => ({ id: s.id, share: overlap(range, s) / len }))
    .filter((x) => x.share > 1e-9);
}

/** Share of each section by its length (a line for the whole route). */
export function lengthShares<T extends ChainageRange & { id: string }>(sections: T[]): { id: string; share: number }[] {
  const total = sections.reduce((s, x) => s + Math.max(0, x.to - x.from), 0);
  if (!(total > 0)) return [];
  return sections.filter((s) => s.to > s.from).map((s) => ({ id: s.id, share: (s.to - s.from) / total }));
}
