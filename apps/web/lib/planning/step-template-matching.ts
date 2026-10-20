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
// is "ambiguous" and is never pre-selected. The reverse (template words inside a
// longer activity name, e.g. "Slab Design" ⊃ "Slab") is deliberately not a match:
// those are design / procurement activities, not the site work the steps describe.
//
// Pure: no I/O.

export type MatchKind = "remembered" | "exact" | "partial" | "ambiguous" | "none";

export interface MatchTemplate {
  id: string;
  template_name: string;
  is_active: boolean;
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

export function buildMatcher(templates: MatchTemplate[], remembered: Map<string, string>) {
  const active = templates.filter((t) => t.is_active);
  const activeIds = new Set(active.map((t) => t.id));
  const cores = active.map((t) => {
    const core = templateCoreName(t.template_name);
    return { id: t.id, core, coreTokens: new Set(core.split(" ")), fullTokens: new Set(tokens(t.template_name)) };
  });

  return function suggest(activityName: string): TemplateSuggestion {
    const key = normaliseActivityName(activityName);
    const rememberedId = remembered.get(key);
    if (rememberedId && activeIds.has(rememberedId)) return { templateId: rememberedId, kind: "remembered", alternatives: [] };
    if (!key) return { templateId: null, kind: "none", alternatives: [] };

    const exact = cores.filter((c) => c.core === key);
    if (exact.length >= 1) {
      return { templateId: exact[0].id, kind: exact.length === 1 ? "exact" : "ambiguous", alternatives: exact.slice(1).map((c) => c.id) };
    }

    const words = key.split(" ");
    // Every activity word must appear in the template; fewer extra template words ranks higher.
    const partial = cores
      .filter((c) => words.every((w) => c.fullTokens.has(w)))
      .map((c) => ({ id: c.id, extra: c.coreTokens.size - words.filter((w) => c.coreTokens.has(w)).length }))
      .sort((a, b) => a.extra - b.extra);
    if (partial.length === 0) return { templateId: null, kind: "none", alternatives: [] };
    const best = partial.filter((p) => p.extra === partial[0].extra);
    return {
      templateId: best[0].id,
      kind: best.length === 1 ? "partial" : "ambiguous",
      alternatives: best.slice(1).map((p) => p.id),
    };
  };
}
