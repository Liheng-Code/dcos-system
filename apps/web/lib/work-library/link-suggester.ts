// Pure suggester: BOQ item (dwl_work_items) -> master activities it could be linked to (plan_act_master_work_items).
// Signals, as shares of the signals that apply to the pair:
//   CSI section  0.40  same section 1.0, same division 0.5 (only when both sides carry one)
//   unit         0.20  equal after normalising; "item" / "set" (lump) masters accept any unit; a master without unit is skipped
//   name tokens  0.40  work-item description vs master name + description + trade (Dice), with number tokens
// A work item and master in different known CSI divisions are multiplied by 0.5. Bands/thresholds: lib/text-match.ts.

import {
  MATCH_THRESHOLDS, clamp01, compareNumbers, decideMatch, diceSimilarity, normalizeUnit, numberTokens, round2, wordTokens,
  type MatchBand,
} from "@/lib/text-match";

export { MATCH_THRESHOLDS };

export interface LinkWorkItem {
  id: string;
  code: string;
  description: string;
  unit?: string | null;
  boqSection?: string | null;
  csiSectionCode?: string | null;
  csiDivisionCode?: string | null;
}

export interface LinkMaster {
  id: string;
  name: string;
  description?: string | null;
  defaultUnit?: string | null;
  trade?: string | null;
  status?: string | null;
  csiSectionCode?: string | null;
  csiDivisionCode?: string | null;
}

export interface MasterSuggestion { masterId: string; score: number; reasons: string[] }

const W = { csi: 0.4, unit: 0.2, name: 0.4 } as const;
const LUMP_UNITS = new Set(["item", "set"]);

const divisionOf = (section?: string | null, division?: string | null) => division ?? (section ? section.slice(0, 2) : null);

export function scoreWorkItemToMaster(workItem: LinkWorkItem, master: LinkMaster): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let sum = 0;
  let weight = 0;
  const add = (w: number, s: number) => { sum += w * s; weight += w; };

  const wd = divisionOf(workItem.csiSectionCode, workItem.csiDivisionCode);
  const md = divisionOf(master.csiSectionCode, master.csiDivisionCode);
  let divisionClash = false;
  if (wd && md) {
    if (workItem.csiSectionCode && master.csiSectionCode && workItem.csiSectionCode === master.csiSectionCode) {
      add(W.csi, 1); reasons.push(`same CSI section ${master.csiSectionCode}`);
    } else if (wd === md) {
      add(W.csi, 0.5); reasons.push(`same CSI division ${md}`);
    } else {
      add(W.csi, 0); divisionClash = true; reasons.push(`CSI division differs (${wd} vs ${md})`);
    }
  }

  const wu = normalizeUnit(workItem.unit);
  const mu = normalizeUnit(master.defaultUnit);
  if (wu && mu) {
    if (wu === mu) { add(W.unit, 1); reasons.push(`unit ${wu}`); }
    else if (LUMP_UNITS.has(mu)) { add(W.unit, 0.5); reasons.push(`master is ${mu}-based`); }
    else { add(W.unit, 0); reasons.push(`unit differs (${wu} vs ${mu})`); }
  }

  const wiText = [workItem.description, workItem.boqSection].filter(Boolean).join(" ");
  const maText = [master.name, master.description, master.trade].filter(Boolean).join(" ");
  const nameSim = diceSimilarity(wordTokens(wiText), wordTokens(maText));
  add(W.name, nameSim);
  if (nameSim > 0) reasons.push(`name similarity ${Math.round(nameSim * 100)}%`);

  let score = weight > 0 ? sum / weight : 0;
  const num = compareNumbers(numberTokens(workItem.description), numberTokens(maText));
  if (num === "conflict") { score *= 0.7; reasons.push("size / number differs"); }
  if (divisionClash) score *= 0.5;
  return { score: round2(clamp01(score)), reasons };
}

/** Best masters first, REVIEW threshold and above (override with minScore). */
export function suggestMastersForWorkItem(
  workItem: LinkWorkItem,
  masters: readonly LinkMaster[],
  opts: { limit?: number; minScore?: number } = {},
): MasterSuggestion[] {
  const limit = opts.limit ?? 5;
  const min = opts.minScore ?? MATCH_THRESHOLDS.review;
  return masters
    .map((m) => ({ masterId: m.id, ...scoreWorkItemToMaster(workItem, m) }))
    .filter((s) => s.score >= min)
    .sort((a, b) => b.score - a.score || a.masterId.localeCompare(b.masterId))
    .slice(0, limit);
}

export function linkBand(suggestions: readonly MasterSuggestion[]): MatchBand {
  return decideMatch(suggestions);
}
