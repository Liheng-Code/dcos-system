// Location bridge (doc 21, D5): which WBS level node a BOQ location (building code + level label) is. Pure, no I/O.
//
// Both sides are read into the company level code standard (decision 4, Level Library style):
//   B01..  basement / underground   G00 ground   M01.. mezzanine   L01.. upper levels   R00 roof   PH01.. penthouse
// BOQ labels carry a running number ("04.1F"), WBS codes their own ("03.1F"), so only the part after the number counts.
// A suggestion is never used by itself: the planner confirms it (plan_location_map), as the bridge never writes silently.

import { formatRange, lengthShares, overlapShares, parseChainageRange } from "@/lib/chainage";

export type LevelCode = string; // "B01", "G00", "M01", "L03", "R00", "PH01"

export interface CanonicalLevel {
  code: LevelCode;
  /** physical order, bottom to top */
  rank: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Is this BOQ level label a project-wide (not floor-allocated) line? */
export function isProjectWideLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim().toUpperCase();
  return t === "" || t === "ALL" || t === "GENERAL" || t === "-" || t === "N/A" || t === "PROJECT";
}

function parseCore(raw: string): CanonicalLevel | null {
  const t = raw.trim().toUpperCase().replace(/\s+/g, " ");
  let m: RegExpExecArray | null;
  if (/^(GF|G|G0|G00|GROUND|GROUND FLOOR)$/.test(t)) return { code: "G00", rank: 0 };
  if (/^(UG|UNDERGROUND)$/.test(t)) return { code: "B01", rank: -1 };
  if ((m = /^(?:B|BASEMENT ?)(\d{1,2})$/.exec(t))) return { code: `B${pad(Number(m[1]))}`, rank: -Number(m[1]) };
  if (/^(MZ|M|MEZZ|MEZZANINE)$/.test(t)) return { code: "M01", rank: 0.5 };
  if ((m = /^M(\d{1,2})$/.exec(t))) return { code: `M${pad(Number(m[1]))}`, rank: 0.5 + Number(m[1]) / 100 };
  if ((m = /^(\d{1,2})F$/.exec(t)) || (m = /^L(\d{1,2})$/.exec(t)) || (m = /^LEVEL ?(\d{1,2})$/.exec(t)) || (m = /^(\d{1,2})(?:ST|ND|RD|TH)?$/.exec(t))) {
    const n = Number(m[1]);
    return n === 0 ? { code: "G00", rank: 0 } : { code: `L${pad(n)}`, rank: n };
  }
  if (/^(RF|R|R0|R00|ROOF)$/.test(t)) return { code: "R00", rank: 1000 };
  if (/^PH$/.test(t)) return { code: "PH01", rank: 901 };
  if ((m = /^PH(\d{1,2})$/.exec(t))) return { code: `PH${pad(Number(m[1]))}`, rank: 900 + Number(m[1]) };
  return null;
}

/**
 * Reads a level label or WBS code/name into the company standard, or null when it cannot be read with certainty
 * ("TF", "TR", "LG" are left to the planner).
 */
export function canonicalLevel(label: string | null | undefined): CanonicalLevel | null {
  if (!label) return null;
  // drop a running number prefix: "04.1F", "13-10F", "02 GF"
  let t = label.trim().replace(/^\d{1,3}\s*[.\-_ ]\s*(?=\S)/, "");
  const direct = parseCore(t);
  if (direct) return direct;
  // "1F Floor", "Ground Floor", "Mezzanine Floor", "Roof Level"
  t = t.replace(/\s+(FLOOR|LEVEL|FLR)$/i, "");
  return parseCore(t);
}

// ── Suggestions ─────────────────────────────────────────────────────────────

export interface WbsLevel {
  id: string;
  wbs_code: string;
  wbs_name: string;
  /** code of the building (levels) or route (chainage sections) above */
  building_code: string | null;
  /** chainage sections only: metres from the route start (lib/chainage.ts) */
  chainage_from?: number | null;
  chainage_to?: number | null;
}

export interface BoqLocation {
  building_code: string;
  qs_level_label: string;
  lines: number;
}

export interface SavedLocation {
  building_code: string;
  qs_level_label: string;
  wbs_node_id: string | null;
  status: "confirmed" | "ignored";
  split_rule: SplitRule;
}

/**
 * none: not per level; equal / gfa: share a project-wide line over the building's levels;
 * length: share a whole-route line over its chainage sections by length;
 * chainage: share a line labelled with a chainage range over the sections it overlaps.
 */
export type SplitRule = "none" | "equal" | "gfa" | "length" | "chainage";

export type LocationStatus =
  | "confirmed"     // saved, maps to a level
  | "split"         // saved, project-wide line shared over levels
  | "ignored"       // saved, never drives durations
  | "suggested"     // one WBS level reads the same: confirm to use
  | "unmatched"     // no WBS level reads the same
  | "ambiguous"     // several WBS levels read the same
  | "project_wide"; // "All" / blank: needs a split rule

export interface LocationRow extends BoqLocation {
  key: string;
  canonical: LevelCode | null;
  status: LocationStatus;
  wbs_node_id: string | null;
  split_rule: SplitRule;
  /** WBS levels the planner can choose from (same building first) */
  candidates: string[];
}

export const locationKey = (building: string | null | undefined, label: string | null | undefined) =>
  `${(building ?? "").trim().toUpperCase()}|${(label ?? "").trim().toUpperCase()}`;

const sameBuilding = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toUpperCase() === (b ?? "").trim().toUpperCase();

/** Canonical code of a WBS level node: its code first ("03.1F"), then its name ("Ground Floor"). */
export function wbsLevelCanonical(l: Pick<WbsLevel, "wbs_code" | "wbs_name">): CanonicalLevel | null {
  return canonicalLevel(l.wbs_code) ?? canonicalLevel(l.wbs_name);
}

export function suggestLocationMap(locations: BoqLocation[], levels: WbsLevel[], saved: SavedLocation[]): LocationRow[] {
  const savedByKey = new Map(saved.map((s) => [locationKey(s.building_code, s.qs_level_label), s]));
  const buildings = [...new Set(levels.map((l) => (l.building_code ?? "").toUpperCase()))];
  const levelCanon = new Map(levels.map((l) => [l.id, wbsLevelCanonical(l)?.code ?? null]));

  return locations.map((loc) => {
    const key = locationKey(loc.building_code, loc.qs_level_label);
    const canonical = isProjectWideLabel(loc.qs_level_label) ? null : canonicalLevel(loc.qs_level_label)?.code ?? null;
    // levels of the same building; a single-building project accepts a blank / different building code
    let pool = levels.filter((l) => sameBuilding(l.building_code, loc.building_code));
    if (pool.length === 0 && buildings.length === 1) pool = levels;
    const candidates = pool.map((l) => l.id);
    const base = { ...loc, key, canonical, candidates };

    const s = savedByKey.get(key);
    if (s) {
      if (s.status === "ignored") return { ...base, status: "ignored", wbs_node_id: null, split_rule: s.split_rule };
      if (!s.wbs_node_id) return { ...base, status: "split", wbs_node_id: null, split_rule: s.split_rule };
      return { ...base, status: "confirmed", wbs_node_id: s.wbs_node_id, split_rule: s.split_rule };
    }
    if (isProjectWideLabel(loc.qs_level_label)) return { ...base, status: "project_wide", wbs_node_id: null, split_rule: "none" };
    // "CH 0+000 - 1+500": shared over the chainage sections it overlaps (still confirmed by the planner)
    const range = parseChainageRange(loc.qs_level_label);
    if (range) {
      const sections = pool.filter((l) => l.chainage_from != null && l.chainage_to != null);
      const hit = overlapShares(range, sections.map((l) => ({ id: l.id, from: l.chainage_from!, to: l.chainage_to! })));
      return { ...base, canonical: formatRange(range), status: hit.length > 0 ? "suggested" : "unmatched", wbs_node_id: null, split_rule: hit.length > 0 ? "chainage" : "none" };
    }
    const hits = canonical ? pool.filter((l) => levelCanon.get(l.id) === canonical) : [];
    if (hits.length === 1) return { ...base, status: "suggested", wbs_node_id: hits[0].id, split_rule: "none" };
    return { ...base, status: hits.length > 1 ? "ambiguous" : "unmatched", wbs_node_id: null, split_rule: "none" };
  });
}

// ── Allocation of one BOQ line to WBS levels (used by the per-level calculation) ──

export interface LevelShare {
  wbs_node_id: string;
  share: number;
}

/**
 * Where a BOQ line's quantity goes, from saved decisions only (suggestions are never used).
 * Shares sum to 1, or the list is empty when the line does not drive any level.
 */
export function allocateLine(
  line: { building_code: string | null; level: string | null },
  saved: SavedLocation[],
  levels: WbsLevel[],
  gfaByNode: Map<string, number>,
): LevelShare[] {
  const s = saved.find((x) => locationKey(x.building_code, x.qs_level_label) === locationKey(line.building_code, line.level));
  if (!s || s.status === "ignored") return [];
  if (s.wbs_node_id) return [{ wbs_node_id: s.wbs_node_id, share: 1 }];
  if (s.split_rule === "none") return [];

  let pool = levels.filter((l) => sameBuilding(l.building_code, line.building_code));
  if (pool.length === 0 && new Set(levels.map((l) => (l.building_code ?? "").toUpperCase())).size === 1) pool = levels;
  if (pool.length === 0) return [];

  if (s.split_rule === "chainage" || s.split_rule === "length") {
    const sections = pool
      .filter((l) => l.chainage_from != null && l.chainage_to != null)
      .map((l) => ({ id: l.id, from: l.chainage_from!, to: l.chainage_to! }));
    if (s.split_rule === "length") return lengthShares(sections).map((x) => ({ wbs_node_id: x.id, share: x.share }));
    const range = parseChainageRange(line.level);
    return range ? overlapShares(range, sections).map((x) => ({ wbs_node_id: x.id, share: x.share })) : [];
  }

  if (s.split_rule === "gfa") {
    const total = pool.reduce((sum, l) => sum + (gfaByNode.get(l.id) ?? 0), 0);
    if (total > 0) {
      return pool.filter((l) => (gfaByNode.get(l.id) ?? 0) > 0).map((l) => ({ wbs_node_id: l.id, share: (gfaByNode.get(l.id) ?? 0) / total }));
    }
    // no GFA recorded: fall back to an equal split rather than dropping the quantity
  }
  return pool.map((l) => ({ wbs_node_id: l.id, share: 1 / pool.length }));
}
