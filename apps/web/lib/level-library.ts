// Level Library: company level templates that are copied into a building's WBS.
// Pure helpers (no database); data access is in lib/level-library-queries.ts.
// Schema and copy rules: supabase/migrations/20261003000003_level_library.sql.

export const LEVEL_TYPES = [
  { value: "basement", label: "Basement" },
  { value: "ground", label: "Ground" },
  { value: "mezzanine", label: "Mezzanine" },
  { value: "podium", label: "Podium" },
  { value: "typical", label: "Typical" },
  { value: "penthouse", label: "Penthouse" },
  { value: "roof", label: "Roof" },
  { value: "other", label: "Other" },
] as const;

export type LevelType = (typeof LEVEL_TYPES)[number]["value"];

/** One level in a template, or in the editable draft that gets copied into a building. */
export interface LevelItem {
  level_code: string;
  level_name: string;
  level_type: LevelType;
  floor_height_m: number | null;
  typical_gfa_m2: number | null;
  source_level_id?: string | null;
}

export interface LevelTemplate {
  id: string;
  template_name: string;
  description: string | null;
  building_type: string | null;
  is_active: boolean;
  version: number;
  items: LevelItem[];
}

const TYPE_ORDER: Record<LevelType, number> = {
  basement: 0, ground: 1, mezzanine: 2, podium: 3, typical: 4, penthouse: 5, roof: 6, other: 7,
};

function bareCode(code: string): string {
  return code.trim().toUpperCase().replace(/^LVL-/, "").replace(/^\d+\./, "");
}

/** Level type from a code (B1, 00.UG -> basement; GF, G00 -> ground; ...). Mirrors infer_level_type() in SQL. */
export function inferLevelType(code: string): LevelType {
  const c = bareCode(code);
  if (/^(B\d|BASEMENT|UG|LG|BSM)/.test(c)) return "basement";
  if (/^(G$|GF|G\d|GROUND)/.test(c)) return "ground";
  if (/^(M\d|M$|MZ|MEZZ)/.test(c)) return "mezzanine";
  if (/^(P\d|POD)/.test(c)) return "podium";
  if (/^PH/.test(c)) return "penthouse";
  if (/^(R\d|R$|RF|RT|ROOF)/.test(c)) return "roof";
  return "typical";
}

export interface LevelRangeInput {
  prefix: string;
  from: number;
  to: number;
  /** Zero-pad width for the number in the code (L01 = 2). */
  pad: number;
  /** Name pattern; "{n}" is replaced by the number. */
  nameFormat: string;
  levelType?: LevelType;
  floorHeight?: number | null;
  gfa?: number | null;
}

/** Levels L1..L20 (or B3..B1 when from > to) from a prefix and a range. */
export function generateLevelRange(input: LevelRangeInput): LevelItem[] {
  const from = Math.trunc(input.from);
  const to = Math.trunc(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  const step = from <= to ? 1 : -1;
  const count = Math.abs(to - from) + 1;
  if (count > 200) return [];
  const prefix = input.prefix.trim().toUpperCase();
  const items: LevelItem[] = [];
  for (let i = 0, n = from; i < count; i++, n += step) {
    const code = `${prefix}${String(n).padStart(Math.max(0, input.pad), "0")}`;
    items.push({
      level_code: code,
      level_name: (input.nameFormat || "Level {n}").replace(/\{n\}/g, String(n)),
      level_type: input.levelType ?? inferLevelType(code),
      floor_height_m: input.floorHeight ?? null,
      typical_gfa_m2: input.gfa ?? null,
    });
  }
  return items;
}

function codeNumber(code: string): number {
  const m = bareCode(code).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Bottom-up order: deepest basement first, then ground, ..., roof last. */
export function sortLevels(items: LevelItem[]): LevelItem[] {
  return [...items].sort((a, b) => {
    const t = TYPE_ORDER[a.level_type] - TYPE_ORDER[b.level_type];
    if (t !== 0) return t;
    const na = codeNumber(a.level_code);
    const nb = codeNumber(b.level_code);
    return a.level_type === "basement" ? nb - na : na - nb;
  });
}

/** Problems that block saving or applying a level list. */
export function validateLevelItems(items: LevelItem[]): string[] {
  const errors: string[] = [];
  if (items.length === 0) errors.push("Add at least one level.");
  const seen = new Set<string>();
  items.forEach((it, i) => {
    const code = it.level_code.trim().toUpperCase();
    if (!code || !it.level_name.trim()) errors.push(`Row ${i + 1}: code and name are required.`);
    else if (seen.has(code)) errors.push(`Duplicate code ${code}.`);
    seen.add(code);
    if (it.floor_height_m != null && !(it.floor_height_m > 0)) errors.push(`${code || `Row ${i + 1}`}: height must be above 0.`);
    if (it.typical_gfa_m2 != null && it.typical_gfa_m2 < 0) errors.push(`${code || `Row ${i + 1}`}: GFA cannot be negative.`);
  });
  return errors;
}

/** What applying a list to a building will do: codes already under the building are skipped, never overwritten. */
export function planLevelApply(existingCodes: string[], items: LevelItem[]): { toCreate: LevelItem[]; skipped: LevelItem[] } {
  const existing = new Set(existingCodes.map((c) => c.trim().toUpperCase()));
  const toCreate: LevelItem[] = [];
  const skipped: LevelItem[] = [];
  for (const it of items) (existing.has(it.level_code.trim().toUpperCase()) ? skipped : toCreate).push(it);
  return { toCreate, skipped };
}

/** A blank row for the editors. */
export function emptyLevelItem(): LevelItem {
  return { level_code: "", level_name: "", level_type: "typical", floor_height_m: null, typical_gfa_m2: null };
}
