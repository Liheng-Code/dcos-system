// Generation profile (Generate plan G6): what Generate last used for a project, so a later run (after adding
// floors or chainage sections) needs no re-entry. Pure helpers + data access for plan_act_generation_profiles and
// wbs_templates.kit_code (migration 20261021000025).

import type { SupabaseClient } from "@supabase/supabase-js";
import { pickTemplateVersion, type Kit, type TemplateRef } from "./kit-plan";

export interface GenerationProfile {
  kit_code: string | null;
  picks: Record<string, string>;
  /** template codes per WBS node chosen instead of the kit's */
  overrides: Record<string, string[]>;
  link_levels: boolean;
  updated_at?: string;
}

/** Row overrides as template codes (stored), so they follow new template versions. */
export function overridesToCodes(overrides: Record<string, string[]>, templates: TemplateRef[]): Record<string, string[]> {
  const codeOf = new Map(templates.map((t) => [t.id, t.code]));
  return Object.fromEntries(Object.entries(overrides).map(([node, ids]) => [node, ids.map((id) => codeOf.get(id)).filter((c): c is string => !!c)]));
}

/** Stored overrides back to template ids (the version Generate uses), for nodes that still exist. */
export function codesToOverrides(codes: Record<string, string[]>, templates: TemplateRef[], nodeIds: Set<string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [node, list] of Object.entries(codes ?? {})) {
    if (!nodeIds.has(node)) continue;
    out[node] = list.map((c) => pickTemplateVersion(templates, c)?.id).filter((id): id is string => !!id);
  }
  return out;
}

/** The kit to start from: the remembered one, else the applied WBS template's, else the recommendation. */
export function startingKit<K extends Pick<Kit, "id" | "code" | "status" | "version">>(
  kits: K[], rememberedCode: string | null | undefined, wbsKitCode: string | null | undefined, recommended: K | null,
): K | null {
  const byCode = (code: string | null | undefined) => {
    if (!code) return null;
    const versions = kits.filter((k) => k.code === code && k.status !== "superseded" && k.status !== "archived");
    const rank = (k: K) => (k.status === "active" ? 0 : k.status === "approved" ? 1 : 2);
    return [...versions].sort((a, b) => rank(a) - rank(b) || b.version - a.version)[0] ?? null;
  };
  return byCode(rememberedCode) ?? byCode(wbsKitCode) ?? recommended;
}

/** Top-up scope: when some targets already have activities, only the ones without; else all. */
export function topUpScope(nodeIds: string[], counts: Record<string, number>): { picked: string[]; topUp: boolean } {
  const empty = nodeIds.filter((id) => !(counts[id] > 0));
  const topUp = empty.length < nodeIds.length;
  return { picked: topUp ? empty : nodeIds, topUp };
}

type Db = SupabaseClient;

export async function loadGenerationProfile(db: Db, projectId: string): Promise<{ profile: GenerationProfile | null; wbsKitCode: string | null }> {
  const [{ data: p, error: pe }, { data: proj, error: je }] = await Promise.all([
    db.from("plan_act_generation_profiles").select("kit_code, picks, overrides, link_levels, updated_at").eq("project_id", projectId).maybeSingle(),
    db.from("projects").select("wbs_template_id").eq("id", projectId).maybeSingle(),
  ]);
  if (pe) throw new Error(pe.message);
  if (je) throw new Error(je.message);
  let wbsKitCode: string | null = null;
  const tid = (proj as { wbs_template_id: string | null } | null)?.wbs_template_id;
  if (tid) {
    const { data: t } = await db.from("wbs_templates").select("kit_code").eq("id", tid).maybeSingle();
    wbsKitCode = (t as { kit_code: string | null } | null)?.kit_code ?? null;
  }
  const profile = p ? { ...(p as GenerationProfile), picks: (p as GenerationProfile).picks ?? {}, overrides: (p as GenerationProfile).overrides ?? {} } : null;
  return { profile, wbsKitCode };
}

/** Upserts the project's profile. Needs planning/schedule edit permission (RLS); callers treat failure as non-fatal. */
export async function saveGenerationProfile(db: Db, projectId: string, profile: GenerationProfile): Promise<void> {
  const { error } = await db.from("plan_act_generation_profiles").upsert({
    project_id: projectId, kit_code: profile.kit_code, picks: profile.picks, overrides: profile.overrides, link_levels: profile.link_levels,
  }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}
