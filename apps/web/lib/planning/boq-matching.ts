// Productivity & Resource-Costing Plan, Phase 2 — "suggests which BOQ lines belong to which tasks".
//
// Pure matching logic (no Supabase calls; see boq-mapping-service.ts for the data access that feeds this).
// Per the plan: match by level / name / budget code; SUGGEST only — nothing here writes anything or is ever
// applied without an explicit user action.

export type BoqSource = "tender_boq" | "qs_boq";

export interface BoqCandidate {
  id: string;
  source: BoqSource;
  code: string | null; // item_code (tender) or item_no/item_code (qs)
  description: string;
  unit: string;
  quantity: number;
  /** Free-text floor/level, already normalised terms are fine — normalizeLevel() below handles the rest. */
  level: string | null;
  /** budget_codes.code, if the BOQ line has one. */
  budgetCode: string | null;
}

export interface TaskForMatch {
  id: string;
  taskCode: string;
  taskName: string;
  discipline: string | null;
  /** Nearest ancestor WBS node of type 'level', or the task's area_label as a fallback. */
  levelLabel: string | null;
  /** wbs_tasks.cost_code, compared against a candidate's budgetCode. */
  costCode: string | null;
  /** true when plan_task_work already has a quantity for this task (any source). */
  hasQuantity: boolean;
}

export interface BoqMatchSuggestion {
  candidate: BoqCandidate;
  score: number; // 0..1
  reasons: string[];
}

const STOPWORDS = new Set([
  "the", "and", "and/or", "of", "to", "in", "on", "per", "a", "an", "for", "with", "at",
  "incl", "including", "excl", "excluding", "all", "as", "by", "or",
]);

/** Lower-cases, strips punctuation, drops stopwords/numbers-only tokens. */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return new Set(words);
}

/** Jaccard similarity of the two token sets. */
function nameScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const LEVEL_ALIASES: Record<string, string> = {
  ug: "UG", underground: "UG", basement: "UG", b1: "UG",
  gf: "GF", ground: "GF", "groundfloor": "GF",
  mz: "MZ", mezzanine: "MZ",
  tr: "TR", technicalroof: "TR", tf: "TR",
  rf: "RF", roof: "RF",
  all: "ALL",
};

/** "04.1F" -> "1F", "Ground Floor" -> "GF", "Level 3" -> "3F" … or null if nothing recognisable. */
export function normalizeLevel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^\d+\./, ""); // strip a leading "04." sort prefix
  s = s.replace(/\bfloor\b/g, "").replace(/\blevel\b/g, "").trim();
  s = s.replace(/\s+/g, "");
  if (s in LEVEL_ALIASES) return LEVEL_ALIASES[s];
  const m = /^(\d+)(f)?$/.exec(s);
  if (m) return `${m[1]}F`;
  const upper = s.toUpperCase();
  if (/^\d+F$/.test(upper)) return upper;
  if (["UG", "GF", "MZ", "TR", "RF", "ALL"].includes(upper)) return upper;
  return null;
}

function levelScore(taskLevel: string | null, candidateLevel: string | null): number {
  const a = normalizeLevel(taskLevel);
  const b = normalizeLevel(candidateLevel);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // a lump "All"/"Sum" BOQ line legitimately applies to every floor — a weaker, honest signal
  if (b === "ALL") return 0.4;
  return 0;
}

function budgetCodeScore(taskCostCode: string | null, candidateBudgetCode: string | null): number {
  if (!taskCostCode || !candidateBudgetCode) return 0;
  const a = taskCostCode.trim().toUpperCase();
  const b = candidateBudgetCode.trim().toUpperCase();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.6;
  return 0;
}

const WEIGHTS = { name: 0.55, level: 0.3, budget: 0.15 };

/**
 * Ranks every candidate against every task and returns each task's top suggestions, best first.
 * Nothing here is "auto-applied" — this only ranks; the caller decides what to show and the user decides
 * what to accept (see plan decision: BOQ→WBS mapping is suggest-only, manual override, never silent).
 */
export function suggestBoqMatches(
  tasks: TaskForMatch[],
  candidates: BoqCandidate[],
  opts: { topN?: number; minScore?: number } = {},
): Map<string, BoqMatchSuggestion[]> {
  const topN = opts.topN ?? 3;
  const minScore = opts.minScore ?? 0.2;
  const result = new Map<string, BoqMatchSuggestion[]>();

  for (const task of tasks) {
    const scored: BoqMatchSuggestion[] = [];
    for (const c of candidates) {
      const nScore = nameScore(task.taskName, c.description);
      const lScore = levelScore(task.levelLabel, c.level);
      const bScore = budgetCodeScore(task.costCode, c.budgetCode);
      const score = WEIGHTS.name * nScore + WEIGHTS.level * lScore + WEIGHTS.budget * bScore;
      if (score < minScore) continue;
      const reasons: string[] = [];
      if (nScore > 0) reasons.push(`name overlap ${Math.round(nScore * 100)}%`);
      if (lScore === 1) reasons.push(`same level (${normalizeLevel(task.levelLabel)})`);
      else if (lScore > 0) reasons.push("applies to all levels");
      if (bScore === 1) reasons.push("same budget code");
      else if (bScore > 0) reasons.push("related budget code");
      scored.push({ candidate: c, score, reasons });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length > 0) result.set(task.id, scored.slice(0, topN));
  }
  return result;
}
