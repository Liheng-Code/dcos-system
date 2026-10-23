// I/O for "Auto-suggest links" in the Activity Database (doc 24 phase 1): propose master activities for BOQ items that
// have no link yet, and write the planner's accepted picks as plan_act_master_work_items rows (source 'suggested').
// Pure scoring: link-suggester.ts. The database freezes links of non-draft masters (plan_act_master_work_items guard),
// so picks aimed at an approved / active master are not written; they are reported so the UI can offer a new version.

import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages, inChunks } from "./in-chunks";
import { pickLatestPerCode } from "./catalogue-rules";
import { friendlyDbError } from "./activity-database-service";
import {
  linkBand, suggestMastersForWorkItem, type LinkMaster, type LinkWorkItem, type MasterSuggestion,
} from "./link-suggester";
import type { MatchBand } from "@/lib/text-match";

type Db = SupabaseClient;

export interface SuggestedMaster extends MasterSuggestion {
  visibleCode: string | null;
  code: string;
  name: string;
  status: string;
}

export interface LinkSuggestionRow {
  workItem: { id: string; code: string; description: string; unit: string };
  suggestions: SuggestedMaster[];
  /** 'auto' = a clear winner the planner can accept in bulk; 'review' = needs a look. */
  band: MatchBand;
}

export interface LinkPick { workItemId: string; masterId: string; score: number | null }

export interface NonDraftTarget {
  masterId: string;
  visibleCode: string | null;
  code: string;
  status: string;
  workItemIds: string[];
}

export interface ApplyLinksResult {
  inserted: number;
  /** Pairs that were already linked. */
  alreadyLinked: number;
  /** Masters that are not drafts: nothing was written for them; create a new version first. */
  nonDraft: NonDraftTarget[];
  failed: { workItemId: string; masterId: string; message: string }[];
}

interface MasterRec {
  id: string; code: string; visible_code: string | null; name: string; description: string | null; default_unit: string | null;
  trade: string | null; status: string; version: number; csi_division_code: string | null; csi_section_code: string | null;
}
interface WorkItemRec {
  id: string; code: string; description: string; unit: string; boq_section: string | null;
  csi_section_code: string | null; csi_division_code: string | null;
}

const CURRENT_EXCLUDED = "(superseded,archived)";

/**
 * For active BOQ items with no master link: the best matching current activities. With `divisionCode`, only activities
 * of that CSI division are offered, for items of that division or items without one. Rows without a suggestion are left out.
 */
export async function suggestLinks(db: Db, opts: { divisionCode?: string | null; limit?: number } = {}): Promise<LinkSuggestionRow[]> {
  const limit = opts.limit ?? 3;
  const [linkRows, items, masterRows] = await Promise.all([
    allPages<{ work_item_id: string }>((from, to) => db.from("plan_act_master_work_items").select("work_item_id").order("id").range(from, to)),
    allPages<WorkItemRec>((from, to) =>
      db.from("dwl_work_items").select("id, code, description, unit, boq_section, csi_section_code, csi_division_code").eq("is_active", true).order("id").range(from, to)),
    allPages<MasterRec>((from, to) => {
      let qb = db.from("plan_act_masters")
        .select("id, code, visible_code, name, description, default_unit, trade, status, version, csi_division_code, csi_section_code")
        .not("status", "in", CURRENT_EXCLUDED);
      if (opts.divisionCode) qb = qb.eq("csi_division_code", opts.divisionCode);
      return qb.order("id").range(from, to);
    }),
  ]);

  const linked = new Set(linkRows.map((l) => l.work_item_id));
  const masters = pickLatestPerCode(masterRows);
  const byId = new Map(masters.map((m) => [m.id, m]));
  const linkMasters: LinkMaster[] = masters.map((m) => ({
    id: m.id, name: m.name, description: m.description, defaultUnit: m.default_unit, trade: m.trade, status: m.status,
    csiDivisionCode: m.csi_division_code, csiSectionCode: m.csi_section_code,
  }));

  const out: LinkSuggestionRow[] = [];
  for (const w of items) {
    if (linked.has(w.id)) continue;
    const division = w.csi_division_code ?? (w.csi_section_code ? w.csi_section_code.slice(0, 2) : null);
    if (opts.divisionCode && division && division !== opts.divisionCode) continue;
    const input: LinkWorkItem = {
      id: w.id, code: w.code, description: w.description, unit: w.unit, boqSection: w.boq_section,
      csiSectionCode: w.csi_section_code, csiDivisionCode: division,
    };
    const s = suggestMastersForWorkItem(input, linkMasters, { limit });
    if (!s.length) continue;
    out.push({
      workItem: { id: w.id, code: w.code, description: w.description, unit: w.unit },
      band: linkBand(s),
      suggestions: s.flatMap((x) => {
        const m = byId.get(x.masterId);
        return m ? [{ ...x, visibleCode: m.visible_code, code: m.code, name: m.name, status: m.status }] : [];
      }),
    });
  }
  return out.sort((a, b) => (a.band === b.band ? a.workItem.code.localeCompare(b.workItem.code) : a.band === "auto" ? -1 : 1));
}

/**
 * Writes accepted picks as links (share 100 %, source 'suggested', with the score). Draft masters only; picks for other
 * statuses come back in `nonDraft` untouched. Existing pairs are left as they are.
 */
export async function applySuggestedLinks(db: Db, picks: readonly LinkPick[]): Promise<ApplyLinksResult> {
  const result: ApplyLinksResult = { inserted: 0, alreadyLinked: 0, nonDraft: [], failed: [] };
  if (!picks.length) return result;

  const masterIds = [...new Set(picks.map((p) => p.masterId))];
  const [masters, existing] = await Promise.all([
    inChunks<{ id: string; code: string; visible_code: string | null; status: string }>(masterIds, (p) =>
      db.from("plan_act_masters").select("id, code, visible_code, status").in("id", p)),
    inChunks<{ master_id: string; work_item_id: string; sort_order: number }>(masterIds, (p) =>
      db.from("plan_act_master_work_items").select("master_id, work_item_id, sort_order").in("master_id", p)),
  ]);
  const master = new Map(masters.map((m) => [m.id, m]));
  const have = new Set(existing.map((e) => `${e.master_id}|${e.work_item_id}`));
  const nextSort = new Map<string, number>();
  for (const e of existing) nextSort.set(e.master_id, Math.max(nextSort.get(e.master_id) ?? 0, e.sort_order));

  const nonDraft = new Map<string, NonDraftTarget>();
  const rows: { master_id: string; work_item_id: string; share_pct: number; sort_order: number; source: string; match_score: number | null }[] = [];
  const seen = new Set<string>();
  for (const p of picks) {
    const key = `${p.masterId}|${p.workItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const m = master.get(p.masterId);
    if (!m) { result.failed.push({ workItemId: p.workItemId, masterId: p.masterId, message: "Activity not found" }); continue; }
    if (m.status !== "draft") {
      const t = nonDraft.get(m.id) ?? { masterId: m.id, visibleCode: m.visible_code, code: m.code, status: m.status, workItemIds: [] };
      t.workItemIds.push(p.workItemId);
      nonDraft.set(m.id, t);
      continue;
    }
    if (have.has(key)) { result.alreadyLinked++; continue; }
    const sort = (nextSort.get(m.id) ?? 0) + 1;
    nextSort.set(m.id, sort);
    rows.push({ master_id: m.id, work_item_id: p.workItemId, share_pct: 100, sort_order: sort, source: "suggested", match_score: p.score });
  }
  result.nonDraft = [...nonDraft.values()];

  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const { error } = await db.from("plan_act_master_work_items").insert(part);
    if (!error) { result.inserted += part.length; continue; }
    // retry one by one so a single bad pair does not sink the batch
    for (const r of part) {
      const one = await db.from("plan_act_master_work_items").insert(r);
      if (one.error) result.failed.push({ workItemId: r.work_item_id, masterId: r.master_id, message: friendlyDbError(one.error).message });
      else result.inserted++;
    }
  }
  return result;
}
