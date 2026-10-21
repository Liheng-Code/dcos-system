// Suggests an Activity Step Template for each schedule activity from its name.
//
// Order of preference:
//   remembered — the user picked this template for this activity name before
//                (activity_step_template_match);
//   exact      — same name once level prefixes and the template's " – Typical Floor"
//                style suffix are dropped ("B1 Columns" → "Columns");
//   partial    — every word of the activity is in the template name
//                ("Windows" → "Windows / Glazing – Typical Floor").
// A partial match shared by several templates ("Fire Alarm" → Conduits and Devices)
// is "ambiguous" and is never pre-selected, unless one of them fits the project better (sector /
// building type, lib/template-fit.ts): then that one wins the tie. A template written for another
// sector is never suggested (it can still be picked by hand). The reverse (template words inside a
// longer activity name, e.g. "Slab Design" ⊃ "Slab") is deliberately not a match:
// those are design / procurement activities, not the site work the steps describe.
//
// Pure: no I/O.

import { templateFit, type ProjectKind, type TemplateFit } from "@/lib/template-fit";

export type MatchKind = "remembered" | "exact" | "partial" | "ambiguous" | "none";

export interface MatchTemplate extends Partial<TemplateFit> {
  id: string;
  template_name: string;
  is_active: boolean;
}

/**
 * How well a step template suits the project: 4 = written for its building type, 3 = generic for
 * its sector, 2 = common to every building type (no sector), 1 = same sector, other building
 * types, 0 = another sector.
 */
export function stepTemplateRank(t: MatchTemplate, project: ProjectKind = {}): number {
  const fit = templateFit({ template_category: t.template_category ?? null, building_types: t.building_types ?? [] }, project);
  if (fit === 2) return 4;
  if (fit === 1) return 3;
  if (!t.template_category) return 2;
  return project.sector && t.template_category === project.sector ? 1 : 0;
}

export interface TemplateSuggestion {
  templateId: string | null;
  kind: MatchKind;
  /** Other templates that matched as well as the suggestion (ambiguous partials). */
  alternatives: string[];
}

/** Pre-select a row only when the match is safe to apply without looking. */
export const isConfidentMatch = (kind: MatchKind): boolean =>
  kind === "remembered" || kind === "exact" || kind === "partial";

// Level / zone markers that prefix repeated per-floor activities: B1, L3, GF, RF, Level 2.
const LEVEL_TOKEN = /^(b\d+|l\d+|gf|lg|ug|rf|mz|\d+f|level|lvl|floor|zone)$/;
const NUMERIC = /^\d+$/;

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && t !== "and" && t !== "the" && t !== "of")
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

/** Activity name without level markers, as a stable key ("B1 Columns" → "column"). */
export function normaliseActivityName(name: string): string {
  const all = tokens(name);
  const kept = all.filter((t, i) => !LEVEL_TOKEN.test(t) && !(NUMERIC.test(t) && (i === 0 || LEVEL_TOKEN.test(all[i - 1] ?? ""))));
  return (kept.length > 0 ? kept : all).join(" ");
}

/** Template name without its "– Typical Floor" style qualifier. */
export function templateCoreName(templateName: string): string {
  const core = templateName.split(/\s[–—-]\s/)[0] ?? templateName;
  return normaliseActivityName(core);
}

export function buildMatcher(templates: MatchTemplate[], remembered: Map<string, string>, project: ProjectKind = {}) {
  const active = templates.filter((t) => t.is_active);
  const activeIds = new Set(active.map((t) => t.id));
  const cores = active
    .map((t) => {
      const core = templateCoreName(t.template_name);
      return { id: t.id, rank: stepTemplateRank(t, project), core, coreTokens: new Set(core.split(" ")), fullTokens: new Set(tokens(t.template_name)) };
    })
    .filter((c) => c.rank > 0);
  /** Candidates that suit the project best (see stepTemplateRank). */
  const bestFit = <C extends { rank: number }>(list: C[]): C[] => {
    const top = Math.max(...list.map((c) => c.rank));
    return list.filter((c) => c.rank === top);
  };

  return function suggest(activityName: string): TemplateSuggestion {
    const key = normaliseActivityName(activityName);
    const rememberedId = remembered.get(key);
    if (rememberedId && activeIds.has(rememberedId)) return { templateId: rememberedId, kind: "remembered", alternatives: [] };
    if (!key) return { templateId: null, kind: "none", alternatives: [] };

    const exact = bestFit(cores.filter((c) => c.core === key));
    if (exact.length >= 1) {
      return { templateId: exact[0].id, kind: exact.length === 1 ? "exact" : "ambiguous", alternatives: exact.slice(1).map((c) => c.id) };
    }

    const words = key.split(" ");
    // Every activity word must appear in the template; fewer extra template words ranks higher.
    const partial = cores
      .filter((c) => words.every((w) => c.fullTokens.has(w)))
      .map((c) => ({ id: c.id, rank: c.rank, extra: c.coreTokens.size - words.filter((w) => c.coreTokens.has(w)).length }))
      .sort((a, b) => a.extra - b.extra);
    if (partial.length === 0) return { templateId: null, kind: "none", alternatives: [] };
    const best = bestFit(partial.filter((p) => p.extra === partial[0].extra));
    return {
      templateId: best[0].id,
      kind: best.length === 1 ? "partial" : "ambiguous",
      alternatives: best.slice(1).map((p) => p.id),
    };
  };
}

/**
 * Template groups for a step-template picker: "Recommended for this project" (written for its
 * sector / building type) first, then the trade groups (group_name) A–Z.
 */
export function groupStepTemplates<T extends MatchTemplate & { group_name: string }>(templates: T[], project: ProjectKind = {}): { label: string; items: T[] }[] {
  const active = templates.filter((t) => t.is_active);
  const recommended = active.filter((t) => stepTemplateRank(t, project) >= 3);
  const shown = new Set(recommended);
  const map = new Map<string, T[]>();
  for (const t of active) {
    if (shown.has(t)) continue;
    map.set(t.group_name, [...(map.get(t.group_name) ?? []), t]);
  }
  const groups = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({ label, items }));
  return recommended.length ? [{ label: "★ Recommended for this project", items: recommended }, ...groups] : groups;
}
