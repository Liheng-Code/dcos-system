// Pure matcher: tender / contract BOQ line -> BOQ item (dwl_work_items). No I/O.
// Signals (weights are shares of the signals that apply to the pair, so a line without CSI or classification is not
// capped below the AUTO threshold):
//   name tokens (Dice)         0.50   description vs the item's name + description, plus number tokens (100mm vs 200mm)
//   unit                       0.15   equal after normalising (m2 / m² / sqm ...)
//   classification             0.20   discipline / section / sub-section / sub-element tokens vs the item's text
//   CSI                        0.25   same section 1, same division 0.5 (only when the line carries one)
//   exact code                 line item_code == item code: score = 0.85 + 0.15 * the rest
// Modifiers: numbers on both sides and none agree -> x0.6; units differ -> x0.75; numbers agree -> +0.05.
// Bands (lib/text-match.ts): AUTO >= 0.8 with a lead of 0.1 over the 2nd candidate, REVIEW 0.5 to 0.8.

import {
  MATCH_THRESHOLDS, clamp01, compareNumbers, coverage, decideMatch, diceSimilarity, normalizeUnit, numberTokens, round2, wordTokens,
  type MatchBand,
} from "@/lib/text-match";

export { MATCH_THRESHOLDS, decideMatch };
export type { MatchBand };

export interface BoqLineInput {
  itemCode?: string | null;
  description: string;
  unit?: string | null;
  discipline?: string | null;
  section?: string | null;
  subSection?: string | null;
  subElement?: string | null;
  csiSectionCode?: string | null;
  csiDivisionCode?: string | null;
}

export interface WorkItemInput {
  id: string;
  code: string;
  description: string;
  name?: string | null;
  unit?: string | null;
  boqSection?: string | null;
  csiSectionCode?: string | null;
  csiDivisionCode?: string | null;
  /** Names of the item's CSI section / division, used for the classification signal. */
  csiNames?: string[];
}

export interface WorkItemSuggestion {
  workItemId: string;
  /** 0..1 */
  score: number;
  reasons: string[];
}

const W = { name: 0.5, unit: 0.15, classification: 0.2, csi: 0.25 } as const;

export function scoreBoqLineToWorkItem(line: BoqLineInput, workItem: WorkItemInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let sum = 0;
  let weight = 0;
  const add = (w: number, s: number) => { sum += w * s; weight += w; };

  // name
  const wiText = [workItem.name, workItem.description].filter(Boolean).join(" ");
  const lineWords = wordTokens(line.description);
  const wiWords = wordTokens(wiText);
  const nameSim = diceSimilarity(lineWords, wiWords);
  add(W.name, nameSim);
  if (nameSim > 0) reasons.push(`name similarity ${Math.round(nameSim * 100)}%`);

  // unit
  const lu = normalizeUnit(line.unit);
  const wu = normalizeUnit(workItem.unit);
  let unitMismatch = false;
  if (lu && wu) {
    if (lu === wu) { add(W.unit, 1); reasons.push(`unit ${lu}`); } else { add(W.unit, 0); unitMismatch = true; reasons.push(`unit differs (${lu} vs ${wu})`); }
  }

  // classification (Element Library fields of the line)
  const classTokens = [...new Set(wordTokens([line.discipline, line.section, line.subSection, line.subElement].filter(Boolean).join(" ")))];
  if (classTokens.length) {
    const hay = wordTokens([workItem.name, workItem.description, workItem.boqSection, ...(workItem.csiNames ?? [])].filter(Boolean).join(" "));
    const c = coverage(classTokens, hay);
    add(W.classification, c);
    if (c > 0) reasons.push(`classification ${Math.round(c * 100)}%`);
  }

  // CSI
  const lineDiv = line.csiDivisionCode ?? (line.csiSectionCode ? line.csiSectionCode.slice(0, 2) : null);
  const wiDiv = workItem.csiDivisionCode ?? (workItem.csiSectionCode ? workItem.csiSectionCode.slice(0, 2) : null);
  if ((line.csiSectionCode || lineDiv) && (workItem.csiSectionCode || wiDiv)) {
    if (line.csiSectionCode && workItem.csiSectionCode && line.csiSectionCode === workItem.csiSectionCode) { add(W.csi, 1); reasons.push(`CSI section ${line.csiSectionCode}`); }
    else if (lineDiv && wiDiv && lineDiv === wiDiv) { add(W.csi, 0.5); reasons.push(`CSI division ${lineDiv}`); }
    else { add(W.csi, 0); reasons.push("CSI division differs"); }
  }

  let score = weight > 0 ? sum / weight : 0;

  // numbers (100mm vs 200mm)
  const num = compareNumbers(numberTokens(line.description), numberTokens(wiText));
  if (num === "conflict") { score *= 0.6; reasons.push("size / number differs"); }
  else if (num === "match") { score += 0.05; reasons.push("size / number matches"); }
  if (unitMismatch) score *= 0.75;

  // exact code
  const lc = (line.itemCode ?? "").trim().toLowerCase();
  if (lc && lc === workItem.code.trim().toLowerCase()) {
    score = 0.85 + 0.15 * clamp01(score);
    reasons.unshift("item code equals BOQ item code");
  }
  return { score: round2(clamp01(score)), reasons };
}

/** Best candidates first, only those at or above the REVIEW threshold unless `minScore` says otherwise. */
export function suggestWorkItems(
  line: BoqLineInput,
  candidates: readonly WorkItemInput[],
  opts: { limit?: number; minScore?: number } = {},
): WorkItemSuggestion[] {
  const limit = opts.limit ?? 5;
  const min = opts.minScore ?? MATCH_THRESHOLDS.review;
  return candidates
    .map((wi) => ({ workItemId: wi.id, ...scoreBoqLineToWorkItem(line, wi) }))
    .filter((s) => s.score >= min)
    .sort((a, b) => b.score - a.score || a.workItemId.localeCompare(b.workItemId))
    .slice(0, limit);
}

/** AUTO / REVIEW / none for a best-first suggestion list. */
export function matchBand(suggestions: readonly WorkItemSuggestion[]): MatchBand {
  return decideMatch(suggestions);
}
