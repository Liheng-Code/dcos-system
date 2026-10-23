// I/O for mapping tender BOQ lines to BOQ items (dwl_work_items), BOQ-Driven Programme Plan phase 1 (doc 24).
// Pure scoring lives in boq-item-matcher.ts. Tender lines are scoped by tender_id (tender_boq_items.tender_id ->
// tender_register); a project's lines are those of its tenders (tender_register.project_id), as in qs-bridge-service.
// Review state sits on the line: dwl_match_status 'auto' (proposed by the matcher, awaiting review), 'confirmed'
// (a person agreed, or chose it) or 'rejected' (a person turned the proposal down); null = mapped by hand before this
// feature, or not mapped at all. Auto mode only ever touches lines that are unmapped and have no status.
// Every .in() goes through inChunks (PostgREST URL limit).

import type { SupabaseClient } from "@supabase/supabase-js";
import { listCsiDivisions, listCsiSections } from "@/lib/csi-divisions";
import { normalizeUnit, wordTokens, MATCH_THRESHOLDS } from "@/lib/text-match";
import {
  matchBand, suggestWorkItems, type BoqLineInput, type MatchBand, type WorkItemInput, type WorkItemSuggestion,
} from "./boq-item-matcher";

type Db = SupabaseClient;

const PAGE = 1000;
const CHUNK = 150;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MappingStatus = "auto" | "confirmed" | "rejected";
export type MappingFilter = "unmapped" | "review" | "all";

export interface MappingWorkItem { id: string; code: string; description: string; unit: string }

export interface MappingRow {
  id: string;
  tenderId: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  amount: number;
  buildingCode: string | null;
  level: string | null;
  discipline: string | null;
  section: string | null;
  subSection: string | null;
  subElement: string | null;
  assemblyId: string | null;
  workItemId: string | null;
  workItem: MappingWorkItem | null;
  /** null = not reviewed (mapped by hand earlier, or not mapped). */
  status: MappingStatus | null;
  score: number | null;
}

export interface AutoMapDetail { lineId: string; workItemId: string; score: number; reasons: string[] }

export interface AutoMapResult {
  /** Unmapped, unreviewed lines looked at. */
  considered: number;
  /** Lines with a clear winner (>= 0.8 and a 0.1 lead). */
  auto: number;
  /** Lines with candidates between 0.5 and the AUTO bar, or without a clear lead. */
  review: number;
  none: number;
  /** Lines written (0 for a dry run). */
  applied: number;
  /** What was (or, in a dry run, would be) mapped. */
  mapped: AutoMapDetail[];
  failed: { lineId: string; message: string }[];
}

function must(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function friendly(error: { message: string; code?: string }): Error {
  if (/one_library_source/i.test(error.message)) return new Error("This line is priced from an assembly, so it cannot also be mapped to a BOQ item.");
  if (/lock/i.test(error.message)) return new Error("The tender BOQ is locked; its lines can no longer be changed.");
  return new Error(error.message);
}

async function pagesOf<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    must(error);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

async function chunked<T>(ids: readonly string[], run: (part: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await run(ids.slice(i, i + CHUNK) as string[]);
    must(error);
    out.push(...(data ?? []));
  }
  return out;
}

/** Tender ids for a tender id or a project id. */
export async function resolveTenderIds(db: Db, tenderOrProjectId: string): Promise<string[]> {
  if (!UUID_RE.test(tenderOrProjectId)) throw new Error("Invalid tender or project id");
  const { data, error } = await db.from("tender_register").select("id").or(`id.eq.${tenderOrProjectId},project_id.eq.${tenderOrProjectId}`);
  must(error);
  return (data ?? []).map((t) => (t as { id: string }).id);
}

const LINE_COLS =
  "id, tender_id, item_code, description, unit, quantity, total_amount, building_code, level, discipline, section, sub_section, sub_element, dwl_assembly_id, dwl_work_item_id, dwl_match_status, dwl_match_score";

interface LineRecord {
  id: string; tender_id: string; item_code: string; description: string; unit: string; quantity: number | string;
  total_amount: number | string | null; building_code: string | null; level: string | null; discipline: string | null;
  section: string | null; sub_section: string | null; sub_element: string | null; dwl_assembly_id: string | null;
  dwl_work_item_id: string | null; dwl_match_status: MappingStatus | null; dwl_match_score: number | string | null;
}

const toLineInput = (r: LineRecord): BoqLineInput => ({
  itemCode: r.item_code, description: r.description, unit: r.unit, discipline: r.discipline, section: r.section,
  subSection: r.sub_section, subElement: r.sub_element,
});

async function loadWorkItems(db: Db, ids: readonly string[]): Promise<Map<string, MappingWorkItem>> {
  const rows = await chunked<MappingWorkItem>(ids, (p) => db.from("dwl_work_items").select("id, code, description, unit").in("id", p));
  return new Map(rows.map((w) => [w.id, w]));
}

/** Lines of a tender (or of every tender of a project) with their current mapping and review state. */
export async function listTenderBoqMappingRows(
  db: Db, tenderOrProjectId: string, opts: { filter?: MappingFilter } = {},
): Promise<MappingRow[]> {
  const filter = opts.filter ?? "all";
  const tenderIds = await resolveTenderIds(db, tenderOrProjectId);
  if (!tenderIds.length) return [];
  const records: LineRecord[] = [];
  for (const tid of tenderIds) {
    records.push(...(await pagesOf<LineRecord>((from, to) => {
      let qb = db.from("tender_boq_items").select(LINE_COLS).eq("tender_id", tid);
      if (filter === "unmapped") qb = qb.is("dwl_work_item_id", null).is("dwl_assembly_id", null);
      else if (filter === "review") qb = qb.eq("dwl_match_status", "auto").not("dwl_work_item_id", "is", null);
      return qb.order("sort_order").order("id").range(from, to) as never;
    })));
  }
  const items = await loadWorkItems(db, [...new Set(records.map((r) => r.dwl_work_item_id).filter((x): x is string => !!x))]);
  return records.map((r) => ({
    id: r.id,
    tenderId: r.tender_id,
    itemCode: r.item_code,
    description: r.description,
    unit: r.unit,
    quantity: Number(r.quantity) || 0,
    amount: Number(r.total_amount) || 0,
    buildingCode: r.building_code,
    level: r.level,
    discipline: r.discipline,
    section: r.section,
    subSection: r.sub_section,
    subElement: r.sub_element,
    assemblyId: r.dwl_assembly_id,
    workItemId: r.dwl_work_item_id,
    workItem: r.dwl_work_item_id ? items.get(r.dwl_work_item_id) ?? null : null,
    status: r.dwl_match_status,
    score: r.dwl_match_score === null ? null : Number(r.dwl_match_score),
  }));
}

// ---------------------------------------------------------------- suggestions

interface WorkItemRecord {
  id: string; code: string; description: string; name: string | null; unit: string; boq_section: string | null;
  csi_section_code: string | null; csi_division_code: string | null;
}

/** Active work items of the signed-in tenant (RLS) with their CSI names, ready for the matcher. */
export async function loadMatchCandidates(db: Db): Promise<WorkItemInput[]> {
  const [items, sections, divisions] = await Promise.all([
    pagesOf<WorkItemRecord>((from, to) =>
      db.from("dwl_work_items").select("id, code, description, name, unit, boq_section, csi_section_code, csi_division_code").eq("is_active", true).order("id").range(from, to) as never),
    listCsiSections(db),
    listCsiDivisions(db),
  ]);
  const secName = new Map(sections.map((s) => [s.code, s.name]));
  const divName = new Map(divisions.map((d) => [d.code, d.name]));
  return items.map((w) => {
    const division = w.csi_division_code ?? (w.csi_section_code ? w.csi_section_code.slice(0, 2) : null);
    return {
      id: w.id, code: w.code, description: w.description, name: w.name, unit: w.unit, boqSection: w.boq_section,
      csiSectionCode: w.csi_section_code, csiDivisionCode: division,
      csiNames: [w.csi_section_code ? secName.get(w.csi_section_code) : undefined, division ? divName.get(division) : undefined].filter((x): x is string => !!x),
    };
  });
}

/** Cheap pre-filter: same unit, or any shared word with the line. */
function prefilter(line: BoqLineInput, candidates: readonly WorkItemInput[]): WorkItemInput[] {
  const unit = normalizeUnit(line.unit);
  const words = new Set(wordTokens([line.description, line.section, line.subSection, line.subElement].filter(Boolean).join(" ")));
  const code = (line.itemCode ?? "").trim().toLowerCase();
  return candidates.filter((c) => {
    if (code && c.code.trim().toLowerCase() === code) return true;
    if (unit && normalizeUnit(c.unit) === unit) return true;
    if (line.csiSectionCode && c.csiSectionCode === line.csiSectionCode) return true;
    return wordTokens(`${c.name ?? ""} ${c.description}`).some((w) => words.has(w));
  });
}

function suggestAll(records: readonly LineRecord[], candidates: readonly WorkItemInput[], limit: number): Map<string, WorkItemSuggestion[]> {
  const out = new Map<string, WorkItemSuggestion[]>();
  for (const r of records) {
    const line = toLineInput(r);
    out.set(r.id, suggestWorkItems(line, prefilter(line, candidates), { limit }));
  }
  return out;
}

/** Best BOQ item candidates for each line (best first, REVIEW threshold and above). */
export async function suggestForLines(db: Db, lineIds: readonly string[], opts: { limit?: number } = {}): Promise<Map<string, WorkItemSuggestion[]>> {
  const [records, candidates] = await Promise.all([
    chunked<LineRecord>(lineIds, (p) => db.from("tender_boq_items").select(LINE_COLS).in("id", p)),
    loadMatchCandidates(db),
  ]);
  return suggestAll(records, candidates, opts.limit ?? 5);
}

// ---------------------------------------------------------------- auto map

/**
 * Maps the clear winners of a tender's unmapped lines. Only lines with no BOQ item, no assembly and no review status
 * are considered, so confirmed, rejected and already-proposed lines are never overwritten. apply=false is a dry run
 * (nothing is written; `mapped` lists what would be).
 */
export async function autoMapTender(db: Db, tenderId: string, opts: { apply: boolean }): Promise<AutoMapResult> {
  if (!UUID_RE.test(tenderId)) throw new Error("Invalid tender id");
  const [records, candidates] = await Promise.all([
    pagesOf<LineRecord>((from, to) =>
      db.from("tender_boq_items").select(LINE_COLS).eq("tender_id", tenderId)
        .is("dwl_work_item_id", null).is("dwl_assembly_id", null).is("dwl_match_status", null)
        .order("sort_order").order("id").range(from, to) as never),
    loadMatchCandidates(db),
  ]);
  const suggestions = suggestAll(records, candidates, 3);

  const result: AutoMapResult = { considered: records.length, auto: 0, review: 0, none: 0, applied: 0, mapped: [], failed: [] };
  for (const r of records) {
    const s = suggestions.get(r.id) ?? [];
    const band: MatchBand = matchBand(s);
    if (band === "none") { result.none++; continue; }
    if (band === "review") { result.review++; continue; }
    result.auto++;
    result.mapped.push({ lineId: r.id, workItemId: s[0].workItemId, score: s[0].score, reasons: s[0].reasons });
  }

  if (opts.apply) {
    for (let i = 0; i < result.mapped.length; i += 10) {
      await Promise.all(result.mapped.slice(i, i + 10).map(async (m) => {
        const { data, error } = await db.from("tender_boq_items")
          .update({ dwl_work_item_id: m.workItemId, dwl_match_status: "auto", dwl_match_score: m.score })
          .eq("id", m.lineId).is("dwl_work_item_id", null).is("dwl_match_status", null).select("id");
        if (error) result.failed.push({ lineId: m.lineId, message: friendly(error).message });
        else if (data?.length) result.applied++;
        else result.failed.push({ lineId: m.lineId, message: "The line changed meanwhile and was left alone." });
      }));
    }
  }
  return result;
}

// ---------------------------------------------------------------- single-line decisions

async function updateLine(db: Db, lineId: string, patch: Record<string, unknown>): Promise<void> {
  const { data, error } = await db.from("tender_boq_items").update(patch).eq("id", lineId).select("id");
  if (error) throw friendly(error);
  if (!data?.length) throw new Error("Line not found, or you do not have permission to change it.");
}

/** Maps a line to a BOQ item by hand (or accepts a suggestion: pass its score). Status becomes 'confirmed'. */
export async function setMapping(db: Db, lineId: string, workItemId: string, score: number | null = null): Promise<void> {
  await updateLine(db, lineId, { dwl_work_item_id: workItemId, dwl_match_status: "confirmed", dwl_match_score: score });
}

/** Confirms the mapping a line already has (typically an 'auto' one). */
export async function confirmMapping(db: Db, lineId: string): Promise<void> {
  const { data, error } = await db.from("tender_boq_items").update({ dwl_match_status: "confirmed" })
    .eq("id", lineId).not("dwl_work_item_id", "is", null).select("id");
  if (error) throw friendly(error);
  if (!data?.length) throw new Error("This line has no BOQ item to confirm.");
}

/** Turns a proposal down: the BOQ item is removed and the line is marked 'rejected' so auto mode leaves it alone. */
export async function rejectMapping(db: Db, lineId: string): Promise<void> {
  await updateLine(db, lineId, { dwl_work_item_id: null, dwl_match_status: "rejected", dwl_match_score: null });
}

/** Back to unmapped and unreviewed; auto mode may propose it again. */
export async function clearMapping(db: Db, lineId: string): Promise<void> {
  await updateLine(db, lineId, { dwl_work_item_id: null, dwl_match_status: null, dwl_match_score: null });
}

export { MATCH_THRESHOLDS };
