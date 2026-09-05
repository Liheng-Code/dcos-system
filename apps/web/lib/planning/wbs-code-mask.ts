// MS-Project-style WBS code mask. Pure module: no Supabase, no React.
//
// A WBS code is a positional outline code: `prefix + segment(level1) + sep +
// segment(level2) + …`, one segment per outline level, each formatted by that
// level's mask entry. Outline levels deeper than the mask reuse the last entry
// (MS Project behaviour). The displayed code is the persisted
// `wbs_outline_code` override when set, else this live-computed value.

export type WbsSeq = "numbers" | "upper" | "lower" | "chars";

export interface WbsMaskLevel {
  sequence: WbsSeq;
  /** Fixed segment width (zero-pad numbers). `null` = "Any". */
  length: number | null;
  /** Separator that follows this level (before the next segment). */
  separator: string;
}

export interface WbsCodeMask {
  prefix: string;
  levels: WbsMaskLevel[];
  generateForNew: boolean;
  verifyUnique: boolean;
}

export const DEFAULT_MASK: WbsCodeMask = {
  prefix: "",
  levels: [{ sequence: "numbers", length: 2, separator: "." }],
  generateForNew: true,
  verifyUnique: true,
};

export const SEQ_LABELS: Record<WbsSeq, string> = {
  numbers: "Numbers (ordered)",
  upper: "Uppercase Letters (ordered)",
  lower: "Lowercase Letters (ordered)",
  chars: "Characters (unordered)",
};

export const SEPARATORS = [".", "-", "+", "/", ""] as const;
export const SEP_NONE_LABEL = "(none)";

/** 1 → "A", 26 → "Z", 27 → "AA" … (spreadsheet-column style). */
function toLetters(n: number): string {
  let s = "";
  let x = Math.max(1, Math.trunc(n));
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** Format one segment for a 1-based sibling index at the given mask level. */
export function formatSegment(index1: number, level: WbsMaskLevel): string {
  const i = Math.max(1, Math.trunc(index1));
  let raw: string;
  switch (level.sequence) {
    case "upper":
      raw = toLetters(i);
      break;
    case "lower":
      raw = toLetters(i).toLowerCase();
      break;
    case "chars":
      // No ordered sequence for "Characters" — fall back to the number until
      // per-segment editing lands.
      raw = String(i);
      break;
    case "numbers":
    default:
      raw = String(i);
      break;
  }
  if (level.length && level.length > 0) {
    return level.sequence === "numbers"
      ? raw.padStart(level.length, "0")
      : raw.padStart(level.length, level.sequence === "lower" ? "a" : "A");
  }
  return raw;
}

function levelAt(mask: WbsCodeMask, depth: number): WbsMaskLevel {
  return mask.levels[Math.min(depth, mask.levels.length - 1)] ?? DEFAULT_MASK.levels[0];
}

/**
 * WBS code for a row whose outline position is `pathIndexes` (1-based sibling
 * index at each level from the root down, e.g. `[2, 1, 3]` = 2nd top-level →
 * its 1st child → that child's 3rd child).
 */
export function computeWbsCode(pathIndexes: number[], mask: WbsCodeMask): string {
  if (pathIndexes.length === 0) return mask.prefix;
  let out = mask.prefix;
  pathIndexes.forEach((ix, depth) => {
    if (depth > 0) out += levelAt(mask, depth - 1).separator;
    out += formatSegment(ix, levelAt(mask, depth));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Row shape from plan_wbs_code_mask
// ---------------------------------------------------------------------------
export interface WbsMaskRow {
  code_prefix: string | null;
  levels: unknown;
  generate_for_new: boolean | null;
  verify_unique: boolean | null;
}

export function maskFromRow(row: WbsMaskRow | null): WbsCodeMask {
  if (!row) return DEFAULT_MASK;
  const levels = Array.isArray(row.levels)
    ? (row.levels as Record<string, unknown>[]).map((l) => ({
        sequence: (["numbers", "upper", "lower", "chars"].includes(String(l.sequence))
          ? l.sequence
          : "numbers") as WbsSeq,
        length:
          l.length === null || l.length === undefined || l.length === "" || Number.isNaN(Number(l.length))
            ? null
            : Number(l.length),
        separator: typeof l.separator === "string" ? l.separator : ".",
      }))
    : DEFAULT_MASK.levels;
  return {
    prefix: row.code_prefix ?? "",
    levels: levels.length ? levels : DEFAULT_MASK.levels,
    generateForNew: row.generate_for_new ?? true,
    verifyUnique: row.verify_unique ?? true,
  };
}
