// Pure helpers for the "Auto-suggest links" dialog: which suggestion is ticked per BOQ item.

import type { LinkPick, LinkSuggestionRow } from "./link-suggestion-service";

/** Ticked suggestion per work item id (one per item). */
export type PickMap = Map<string, { masterId: string; score: number }>;

/** The top suggestion of every row whose band is "auto". */
export function autoPicks(rows: readonly LinkSuggestionRow[]): PickMap {
  const m: PickMap = new Map();
  for (const r of rows) {
    const top = r.suggestions[0];
    if (r.band === "auto" && top) m.set(r.workItem.id, { masterId: top.masterId, score: top.score });
  }
  return m;
}

/** Ticks a suggestion, or unticks it when it is already the ticked one. Returns a new map. */
export function togglePick(picks: PickMap, workItemId: string, s: { masterId: string; score: number }): PickMap {
  const next = new Map(picks);
  if (next.get(workItemId)?.masterId === s.masterId) next.delete(workItemId);
  else next.set(workItemId, { masterId: s.masterId, score: s.score });
  return next;
}

export function picksToList(picks: PickMap): LinkPick[] {
  return [...picks].map(([workItemId, p]) => ({ workItemId, masterId: p.masterId, score: p.score }));
}

/** Score 0..1 as "85%". */
export function scoreLabel(score: number): string {
  return `${Math.round(score * 100)}%`;
}
