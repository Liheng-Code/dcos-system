// Pure text helpers shared by the BOQ line -> BOQ item matcher (QS) and the BOQ item -> activity link suggester
// (Planning): unit normalisation, tokenising, token similarity and the common AUTO / REVIEW thresholds.

export const MATCH_THRESHOLDS = {
  /** Score a top candidate needs to be accepted automatically. */
  auto: 0.8,
  /** ...and the lead it needs over the second candidate. */
  margin: 0.1,
  /** From here a candidate is offered for review. */
  review: 0.5,
} as const;

export type MatchBand = "auto" | "review" | "none";

export interface Suggestion {
  /** Id of the suggested target. */
  id: string;
  /** 0..1 */
  score: number;
  reasons: string[];
}

/** Sorted best-first list -> what to do with the top candidate. */
export function decideMatch(sorted: readonly { score: number }[]): MatchBand {
  const top = sorted[0];
  if (!top) return "none";
  const second = sorted[1];
  if (top.score >= MATCH_THRESHOLDS.auto && (!second || top.score - second.score >= MATCH_THRESHOLDS.margin)) return "auto";
  if (top.score >= MATCH_THRESHOLDS.review) return "review";
  return "none";
}

// ---------------------------------------------------------------- units

const UNIT_ALIASES: Record<string, string> = {
  m2: "m2", "m²": "m2", sqm: "m2", "sq.m": "m2", "sq m": "m2", "m^2": "m2", sqmt: "m2",
  m3: "m3", "m³": "m3", cum: "m3", "cu.m": "m3", "cu m": "m3", cbm: "m3", "m^3": "m3",
  no: "no", nos: "no", nr: "no", ea: "no", each: "no", pc: "no", pcs: "no", unit: "no", units: "no",
  m: "m", lm: "m", rm: "m", "lin.m": "m", "l.m": "m", mtr: "m",
  kg: "kg", kgs: "kg",
  t: "t", tonne: "t", tonnes: "t", ton: "t", tons: "t", mt: "t",
  item: "item", ls: "item", sum: "item", "l.s": "item", "lump sum": "item", lumpsum: "item", lot: "item",
  day: "day", days: "day", hr: "hr", hrs: "hr", hour: "hr", hours: "hr",
  set: "set", sets: "set", l: "l", ltr: "l", litre: "l", liter: "l",
};

/** Canonical unit key ("m2", "m3", "no", "m", "kg", "t", "item", ...); unknown units are lower-cased as is; empty -> null. */
export function normalizeUnit(unit: string | null | undefined): string | null {
  const u = (unit ?? "").trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
  if (!u) return null;
  return UNIT_ALIASES[u] ?? UNIT_ALIASES[u.replace(/\./g, "")] ?? u;
}

// ---------------------------------------------------------------- tokens

const STOP_WORDS = new Set([
  "and", "or", "of", "the", "with", "for", "to", "in", "on", "at", "by", "as", "per", "all", "a", "an", "etc", "incl",
  "including", "complete", "supply", "supplying", "install", "installation", "installing", "fix", "fixing", "fixed", "only",
  "provide", "providing", "work", "works", "thick", "thk", "type", "item", "nos", "no", "from", "inc", "ex", "excl", "any",
]);

const MEASURE_UNITS = "mm|cm|m|kg|mpa|kn|nmm2|mm2|m2|m3|kv|kw|a|amp|inch|in|ft|l|ltr|mp";
const NUMBER_RE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE_UNITS})?(?![a-z0-9])`, "g");

function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 6 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("es") && /(ch|sh|x|s|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Number tokens with their unit glued on: "100 mm" -> "100mm", "C25/30" -> "25", "30". */
export function numberTokens(text: string | null | undefined): string[] {
  const s = (text ?? "").toLowerCase();
  const out: string[] = [];
  for (const m of s.matchAll(NUMBER_RE)) {
    const n = m[1].replace(",", ".").replace(/^0+(?=\d)/, "");
    out.push(`${n}${m[2] ?? ""}`);
  }
  return out;
}

/** Lower-case word tokens: numbers and their units removed, stop words dropped, plurals folded. */
export function wordTokens(text: string | null | undefined): string[] {
  const s = (text ?? "").toLowerCase().replace(NUMBER_RE, " ").replace(/[^a-z\s]/g, " ");
  const out: string[] = [];
  for (const raw of s.split(/\s+/)) {
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue;
    const w = stem(raw);
    if (w.length >= 2 && !STOP_WORDS.has(w)) out.push(w);
  }
  return out;
}

/** Sorensen-Dice coefficient of two token lists treated as sets (0..1). Empty on either side -> 0. */
export function diceSimilarity(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return (2 * common) / (A.size + B.size);
}

/** Share of `needles` found in `haystack` (0..1). Empty needles -> 0. */
export function coverage(needles: readonly string[], haystack: readonly string[]): number {
  const N = new Set(needles);
  if (!N.size) return 0;
  const H = new Set(haystack);
  let hit = 0;
  for (const t of N) if (H.has(t)) hit++;
  return hit / N.size;
}

/** Compares number tokens of two texts: "match" when they share a token, "conflict" when both have some and none agree. */
export function compareNumbers(a: readonly string[], b: readonly string[]): "match" | "conflict" | "none" {
  if (!a.length || !b.length) return "none";
  const B = new Set(b);
  return a.some((t) => B.has(t)) ? "match" : "conflict";
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
