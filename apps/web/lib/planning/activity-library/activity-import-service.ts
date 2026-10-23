// I/O for the Activity Database Excel import: read the workbook, preview what would change, commit.
// Parsing and validation are pure (activity-database-import.ts). New activities land as DRAFT, upserted by visible
// code (or code). Existing non-draft activities only get catalogue fields (division, trade, visible code);
// BOQ links are only written for drafts because the database freezes them otherwise.

import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  ACTIVITIES_SHEET, ACTIVITY_HEADERS, LINKS_SHEET, LINK_HEADERS, isPercentHeader, parseActivityImport, percentCellValue,
  type ImportActivity, type ImportLink, type ParsedImport, type RawRow, type RawSheets,
} from "./activity-database-import";
import { allPages, inChunks } from "./in-chunks";
import { dedupeLast } from "./catalogue-rules";
import { friendlyDbError } from "./activity-database-service";

type Db = SupabaseClient;

// ---------------------------------------------------------------- workbook

function sheetRows(wb: XLSX.WorkBook, name: string, fallbackIndex: number): RawRow[] {
  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase()) ?? wb.SheetNames[fallbackIndex];
  if (!key) return [];
  const ws = wb.Sheets[key];
  // Percent-formatted cells hold fractions (50% = 0.5): scale them to plain percents in the % columns before converting.
  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const head = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
      if (!head || !isPercentHeader(String(head.v ?? ""))) continue;
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === "n" && typeof cell.v === "number") cell.v = percentCellValue(cell.v, cell.z, cell.w);
      }
    }
  }
  return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", raw: true });
}

/** Reads the two sheets (matched by name, else first / second sheet) into raw rows. */
export async function readWorkbook(file: File): Promise<RawSheets> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellNF: true });
  return { activities: sheetRows(wb, ACTIVITIES_SHEET, 0), links: sheetRows(wb, LINKS_SHEET, 1) };
}

/** Convenience: workbook file -> validated rows. */
export async function parseWorkbookFile(file: File): Promise<ParsedImport> {
  return parseActivityImport(await readWorkbook(file));
}

/** Empty xlsx with the two sheets and their headers (plus a short help sheet). */
export function downloadTemplate(): Blob {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ACTIVITY_HEADERS]), ACTIVITIES_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([LINK_HEADERS]), LINKS_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Sheet", "Column", "Rule"],
    [ACTIVITIES_SHEET, "Division Code", "01 to 16 (CSI division)"],
    [ACTIVITIES_SHEET, "Visible Code", "Optional, e.g. D04-001. Existing rows are updated by it. Empty = assigned automatically"],
    [ACTIVITIES_SHEET, "Code", "Unique activity code. Optional when Visible Code is given"],
    [ACTIVITIES_SHEET, "Type", "construction, procurement, design, submittal, testing or milestone"],
    [ACTIVITIES_SHEET, "Min % / Max %", "0 to 100, min must not exceed max"],
    [LINKS_SHEET, "Activity Code", "Visible code or code of an activity in the file or already in the library"],
    [LINKS_SHEET, "Work Item Code", "Code of a cost-library work item (BOQ item)"],
    [LINKS_SHEET, "Days/Unit, %", "Duration in days per unit; share of the work item (default 100)"],
  ]), "Help");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------------------------------------------------------------- planning (shared by preview and commit)

interface ExistingMaster {
  id: string; code: string; visible_code: string | null; status: string; version: number;
  name: string; description: string | null; default_unit: string | null; activity_type: string | null;
  min_duration_pct: number | null; max_duration_pct: number | null; trade: string | null; division_id: string | null;
}
const EXISTING_COLS = "id, code, visible_code, status, version, name, description, default_unit, activity_type, min_duration_pct, max_duration_pct, trade, division_id";

export type ActivityAction = "create" | "update" | "update_catalogue";
export interface ActivityPreview {
  row: number; name: string; visibleCode: string | null; code: string | null; action: ActivityAction;
  existingId: string | null; existingStatus: string | null;
  /** For a new activity: the domain / category / family it will be filed under (null = none available, the row will fail). */
  hierarchy: string | null;
  /** Fields in the file that differ from a non-draft activity and will NOT be applied. */
  skippedFields: string[];
}
export type LinkAction = "create" | "update" | "skip_not_draft" | "unknown_activity" | "unknown_work_item";
export interface LinkPreview { row: number; activityRef: string; workItemCode: string; action: LinkAction; note: string | null }

export interface ImportPreview {
  activities: ActivityPreview[];
  links: LinkPreview[];
  unknownWorkItemCodes: string[];
  counts: { create: number; update: number; updateCatalogue: number; linksCreate: number; linksUpdate: number; linksSkipped: number };
}

interface Plan {
  preview: ImportPreview;
  existingByRow: Map<number, ExistingMaster>;
  workItemIdByCode: Map<string, string>;
  /** activity ref (upper-case visible code or code) -> {existing master | file row} */
  refToExisting: Map<string, ExistingMaster>;
  refToRow: Map<string, number>;
  existingLinks: Set<string>;
  hierarchyByDivisionId: Map<string, Hierarchy | null>;
  divisionIdByCode: Map<string, string>;
}

interface Hierarchy { domain_id: string; category_id: string; family_id: string; label: string }

async function findExisting(db: Db, activities: ImportActivity[]): Promise<ExistingMaster[]> {
  const visible = [...new Set(activities.map((a) => a.visibleCode).filter((v): v is string => !!v))];
  const codes = [...new Set(activities.map((a) => a.code).filter((v): v is string => !!v))];
  const [byV, byC] = await Promise.all([
    inChunks<ExistingMaster>(visible, (p) => db.from("plan_act_masters").select(EXISTING_COLS).in("visible_code", p)),
    inChunks<ExistingMaster>(codes, (p) => db.from("plan_act_masters").select(EXISTING_COLS).in("code", p)),
  ]);
  return [...new Map([...byV, ...byC].map((m) => [m.id, m])).values()];
}

/** Prefers the live version: not superseded / archived, then the highest version. */
function pickCurrent(list: ExistingMaster[]): ExistingMaster | undefined {
  const rank = (m: ExistingMaster) => (["superseded", "archived"].includes(m.status) ? 0 : 1);
  return [...list].sort((a, b) => rank(b) - rank(a) || b.version - a.version)[0];
}

async function buildPlan(db: Db, parsed: ParsedImport): Promise<Plan> {
  const existing = await findExisting(db, parsed.activities);
  const byVisible = new Map<string, ExistingMaster[]>();
  const byCode = new Map<string, ExistingMaster[]>();
  for (const m of existing) {
    if (m.visible_code) byVisible.set(m.visible_code, [...(byVisible.get(m.visible_code) ?? []), m]);
    byCode.set(m.code, [...(byCode.get(m.code) ?? []), m]);
  }

  const { data: divs, error: divErr } = await db.from("plan_act_divisions").select("id, code");
  if (divErr) throw friendlyDbError(divErr);
  const divisionIdByCode = new Map(((divs ?? []) as { id: string; code: string }[]).map((d) => [d.code, d.id]));
  const hierarchyByDivisionId = new Map<string, Hierarchy | null>();
  const wantsHierarchy = new Set<string>();
  for (const a of parsed.activities) {
    const isNew = !((a.visibleCode ? pickCurrent(byVisible.get(a.visibleCode) ?? []) : undefined) ?? (a.code ? pickCurrent(byCode.get(a.code) ?? []) : undefined));
    const id = divisionIdByCode.get(a.divisionCode);
    if (isNew && id) wantsHierarchy.add(id);
  }
  for (const id of wantsHierarchy) hierarchyByDivisionId.set(id, await defaultHierarchy(db, id));
  const hierarchyLabel = (a: ImportActivity) => hierarchyByDivisionId.get(divisionIdByCode.get(a.divisionCode) ?? "")?.label ?? null;

  const existingByRow = new Map<number, ExistingMaster>();
  const refToExisting = new Map<string, ExistingMaster>();
  const refToRow = new Map<string, number>();
  const activities: ActivityPreview[] = parsed.activities.map((a) => {
    const found = (a.visibleCode ? pickCurrent(byVisible.get(a.visibleCode) ?? []) : undefined) ?? (a.code ? pickCurrent(byCode.get(a.code) ?? []) : undefined);
    if (found) existingByRow.set(a.row, found);
    for (const ref of [a.visibleCode, a.code]) if (ref) { refToRow.set(ref, a.row); if (found) refToExisting.set(ref, found); }
    if (!found) return { row: a.row, name: a.name, visibleCode: a.visibleCode, code: a.code, action: "create", existingId: null, existingStatus: null, hierarchy: hierarchyLabel(a), skippedFields: [] };
    if (found.status === "draft") {
      return { row: a.row, name: a.name, visibleCode: a.visibleCode, code: a.code, action: "update", existingId: found.id, existingStatus: found.status, hierarchy: null, skippedFields: [] };
    }
    const skipped: string[] = [];
    const differs = (cur: unknown, next: unknown) => next !== null && (cur ?? null) !== next;
    if (a.name !== found.name) skipped.push("name");
    if (differs(found.description, a.description)) skipped.push("description");
    if (differs(found.default_unit, a.unit)) skipped.push("unit");
    if (differs(found.activity_type, a.activityType)) skipped.push("type");
    if (differs(found.min_duration_pct === null ? null : Number(found.min_duration_pct), a.minPct)) skipped.push("min %");
    if (differs(found.max_duration_pct === null ? null : Number(found.max_duration_pct), a.maxPct)) skipped.push("max %");
    return { row: a.row, name: a.name, visibleCode: a.visibleCode, code: a.code, action: "update_catalogue", existingId: found.id, existingStatus: found.status, hierarchy: null, skippedFields: skipped };
  });

  // BOQ links
  const wiCodes = [...new Set(parsed.links.map((l) => l.workItemCode.toUpperCase()))];
  const wiRows = await inChunks<{ id: string; code: string }>(wiCodes, (p) => db.from("dwl_work_items").select("id, code").in("code", p));
  const workItemIdByCode = new Map(wiRows.map((w) => [w.code.toUpperCase(), w.id]));

  // refs used by links that are not in the file: look them up in the library
  const extraRefs = [...new Set(parsed.links.map((l) => l.activityRef))].filter((r) => !refToRow.has(r) && !refToExisting.has(r));
  if (extraRefs.length) {
    const [v, c] = await Promise.all([
      inChunks<ExistingMaster>(extraRefs, (p) => db.from("plan_act_masters").select(EXISTING_COLS).in("visible_code", p)),
      inChunks<ExistingMaster>(extraRefs, (p) => db.from("plan_act_masters").select(EXISTING_COLS).in("code", p)),
    ]);
    const groups = new Map<string, ExistingMaster[]>();
    for (const m of [...v, ...c]) for (const ref of [m.visible_code, m.code]) if (ref && extraRefs.includes(ref)) groups.set(ref, [...(groups.get(ref) ?? []), m]);
    for (const [ref, list] of groups) { const cur = pickCurrent(list); if (cur) refToExisting.set(ref, cur); }
  }

  const existingIds = [...new Set([...refToExisting.values()].map((m) => m.id))];
  const linkRows = await inChunks<{ master_id: string; work_item_id: string }>(existingIds, (p) =>
    db.from("plan_act_master_work_items").select("master_id, work_item_id").in("master_id", p));
  const existingLinks = new Set(linkRows.map((l) => `${l.master_id}|${l.work_item_id}`));

  const links: LinkPreview[] = parsed.links.map((l) => {
    const base = { row: l.row, activityRef: l.activityRef, workItemCode: l.workItemCode };
    const wiId = workItemIdByCode.get(l.workItemCode.toUpperCase());
    const ex = refToExisting.get(l.activityRef);
    if (!refToRow.has(l.activityRef) && !ex) return { ...base, action: "unknown_activity", note: "Activity not found in the file or the library" };
    if (!wiId) return { ...base, action: "unknown_work_item", note: "Work item code not in the cost library" };
    if (ex && ex.status !== "draft") return { ...base, action: "skip_not_draft", note: `Activity is ${ex.status}; links are frozen` };
    return { ...base, action: ex && existingLinks.has(`${ex.id}|${wiId}`) ? "update" : "create", note: null };
  });

  const n = (list: { action: string }[], a: string) => list.filter((x) => x.action === a).length;
  const preview: ImportPreview = {
    activities, links,
    unknownWorkItemCodes: [...new Set(links.filter((l) => l.action === "unknown_work_item").map((l) => l.workItemCode))],
    counts: {
      create: n(activities, "create"), update: n(activities, "update"), updateCatalogue: n(activities, "update_catalogue"),
      linksCreate: n(links, "create"), linksUpdate: n(links, "update"),
      linksSkipped: links.length - n(links, "create") - n(links, "update"),
    },
  };
  return { preview, existingByRow, workItemIdByCode, refToExisting, refToRow, existingLinks, hierarchyByDivisionId, divisionIdByCode };
}

/** Which rows would be created / updated / skipped, and which work item codes are unknown. Writes nothing. */
export async function previewImport(db: Db, parsed: ParsedImport): Promise<ImportPreview> {
  return (await buildPlan(db, parsed)).preview;
}

// ---------------------------------------------------------------- commit

export interface ImportResult {
  created: number; updated: number; cataloguedOnly: number;
  linksWritten: number; linksSkipped: number;
  errors: { sheet: string; row: number; message: string }[];
}

/**
 * Domain / category / family for a new activity: the first existing activity of the same division, else the first
 * of the whole library. Deterministic (ordered by code, then id) and shown in the preview. Null when the library is empty.
 */
async function defaultHierarchy(db: Db, divisionId: string): Promise<Hierarchy | null> {
  const pick = async (division?: string) => {
    let qb = db.from("plan_act_masters").select("domain_id, category_id, family_id");
    if (division) qb = qb.eq("division_id", division);
    const { data, error } = await qb.order("code").order("id").limit(1);
    if (error) throw friendlyDbError(error);
    return (data?.[0] ?? null) as { domain_id: string; category_id: string; family_id: string } | null;
  };
  const h = (await pick(divisionId)) ?? (await pick());
  if (!h) return null;
  const [d, c, f] = await Promise.all([
    db.from("plan_act_domains").select("name").eq("id", h.domain_id).maybeSingle(),
    db.from("plan_act_categories").select("name").eq("id", h.category_id).maybeSingle(),
    db.from("plan_act_families").select("name").eq("id", h.family_id).maybeSingle(),
  ]);
  const nm = (r: { data: unknown }) => (r.data as { name: string } | null)?.name ?? "?";
  return { ...h, label: `${nm(d)} > ${nm(c)} > ${nm(f)}` };
}

/** Writes the import. Row-level problems are collected in `errors`; the rest of the file still goes through. */
export async function commitImport(db: Db, parsed: ParsedImport): Promise<ImportResult> {
  const plan = await buildPlan(db, parsed);
  const result: ImportResult = { created: 0, updated: 0, cataloguedOnly: 0, linksWritten: 0, linksSkipped: 0, errors: [] };

  const divId = plan.divisionIdByCode;

  /** ref -> master id and whether it is a draft (links allowed) */
  const target = new Map<string, { id: string; draft: boolean }>();
  const remember = (a: ImportActivity, id: string, draft: boolean) => {
    for (const ref of [a.visibleCode, a.code]) if (ref) target.set(ref, { id, draft });
  };

  for (const a of parsed.activities) {
    const fail = (message: string) => result.errors.push({ sheet: ACTIVITIES_SHEET, row: a.row, message });
    try {
      const division_id = divId.get(a.divisionCode);
      if (!division_id) { fail(`Division ${a.divisionCode} does not exist`); continue; }
      const ex = plan.existingByRow.get(a.row);
      if (!ex) {
        const h = plan.hierarchyByDivisionId.get(division_id);
        if (!h) { fail("The library has no activity to take a domain / category / family from. Create one activity first."); continue; }
        const { data, error } = await db.from("plan_act_masters").insert({
          domain_id: h.domain_id, category_id: h.category_id, family_id: h.family_id, code: a.code ?? a.visibleCode, name: a.name, description: a.description, default_unit: a.unit,
          division_id, visible_code: a.visibleCode, trade: a.trade, activity_type: a.activityType,
          min_duration_pct: a.minPct, max_duration_pct: a.maxPct, status: "draft", version: 1,
        }).select("id").single();
        if (error) { fail(friendlyDbError(error).message); continue; }
        result.created++;
        remember(a, (data as { id: string }).id, true);
        continue;
      }
      const catalogue: Record<string, unknown> = { division_id };
      if (a.trade) catalogue.trade = a.trade;
      if (!ex.visible_code && a.visibleCode) catalogue.visible_code = a.visibleCode;
      const patch: Record<string, unknown> = { ...catalogue };
      const draft = ex.status === "draft";
      if (draft) {
        patch.name = a.name;
        if (a.description !== null) patch.description = a.description;
        if (a.unit !== null) patch.default_unit = a.unit;
        if (a.activityType !== null) patch.activity_type = a.activityType;
        if (a.minPct !== null) patch.min_duration_pct = a.minPct;
        if (a.maxPct !== null) patch.max_duration_pct = a.maxPct;
      }
      const { data, error } = await db.from("plan_act_masters").update(patch).eq("id", ex.id).select("id");
      if (error) { fail(friendlyDbError(error).message); continue; }
      if (!data?.length) { fail("No permission to change this activity"); continue; }
      if (draft) result.updated++; else result.cataloguedOnly++;
      remember(a, ex.id, draft);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }

  // links
  type LinkRow = { master_id: string; work_item_id: string; duration_days_per_unit: number | null; share_pct: number; row: number };
  const rows: LinkRow[] = [];
  const skip = (l: ImportLink, message: string) => { result.linksSkipped++; result.errors.push({ sheet: LINKS_SHEET, row: l.row, message }); };
  for (const l of parsed.links) {
    const t = target.get(l.activityRef) ?? (() => {
      const ex = plan.refToExisting.get(l.activityRef);
      return ex ? { id: ex.id, draft: ex.status === "draft" } : undefined;
    })();
    const wi = plan.workItemIdByCode.get(l.workItemCode.toUpperCase());
    if (!t) { skip(l, `Activity ${l.activityRef} was not found or not imported`); continue; }
    if (!wi) { skip(l, `Work item ${l.workItemCode} is not in the cost library`); continue; }
    if (!t.draft) { skip(l, `Activity ${l.activityRef} is not a draft; BOQ links are frozen`); continue; }
    rows.push({ master_id: t.id, work_item_id: wi, duration_days_per_unit: l.daysPerUnit, share_pct: l.sharePct, row: l.row });
  }
  // Two file rows can resolve to the same master + work item (visible code on one, code on the other): last row wins.
  const dedup = dedupeLast(rows, (r) => `${r.master_id}|${r.work_item_id}`);
  for (const d of dedup.duplicates) {
    result.linksSkipped++;
    result.errors.push({ sheet: LINKS_SHEET, row: d.row, message: "Duplicate link for the same activity and work item; a later row replaces it" });
  }

  // Existing links keep their sort_order; only new links are appended after the current maximum.
  const masterIds = [...new Set(dedup.rows.map((r) => r.master_id))];
  const current = new Map<string, number>();
  const maxSort = new Map<string, number>();
  for (let i = 0; i < masterIds.length; i += 150) {
    const part = masterIds.slice(i, i + 150);
    const found = await allPages<{ master_id: string; work_item_id: string; sort_order: number }>((from, to) =>
      db.from("plan_act_master_work_items").select("master_id, work_item_id, sort_order").in("master_id", part).order("id").range(from, to));
    for (const f of found) {
      current.set(`${f.master_id}|${f.work_item_id}`, f.sort_order);
      maxSort.set(f.master_id, Math.max(maxSort.get(f.master_id) ?? 0, f.sort_order));
    }
  }
  const strip = ({ row: _row, ...rest }: LinkRow) => { void _row; return rest; };
  const existingRows = dedup.rows.filter((r) => current.has(`${r.master_id}|${r.work_item_id}`)).map(strip);
  const newRows = dedup.rows.filter((r) => !current.has(`${r.master_id}|${r.work_item_id}`)).map((r) => {
    const n = (maxSort.get(r.master_id) ?? 0) + 1;
    maxSort.set(r.master_id, n);
    return { ...strip(r), sort_order: n };
  });
  for (const list of [existingRows, newRows] as Record<string, unknown>[][]) {
    for (let i = 0; i < list.length; i += 200) {
      const part = list.slice(i, i + 200);
      const { error } = await db.from("plan_act_master_work_items").upsert(part, { onConflict: "master_id,work_item_id" });
      if (error) {
        result.linksSkipped += part.length;
        result.errors.push({ sheet: LINKS_SHEET, row: 0, message: friendlyDbError(error).message });
      } else result.linksWritten += part.length;
    }
  }
  return result;
}
