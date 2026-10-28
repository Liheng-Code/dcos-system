// Take-off sessions service (module 04-20-01). Workflow, publication, transfer, calibration,
// calculation and validation writes go through the SECURITY DEFINER RPCs from
// 20261027131621_qs_qto_sessions.sql, which enforce permissions and rules in the database.
// Functions throw an Error with a readable message; the QTO_* code stays on `error.code`.
import { createClient } from "@/lib/supabase/client";
import { toRunPayload, type CalculationRun } from "./calc-engine";
import type { ValidationIssue } from "./validation";
import type {
  QtoCalculationRunRow, QtoCalibration, QtoIssue, QtoItemFactor, QtoPublication, QtoRuleVersion, QtoRuleset,
  QtoSession, QtoSessionVersion, QtoTransfer, QtoVersionReview, RulesetDefinition, TakeoffItem,
} from "./types";
import type { VersionStatus } from "./workflow";

// PostgREST .in() filters travel in the URL; ~215 uuids overflow it (414), so batch them.
const CHUNK = 150;
async function inChunks<T>(ids: readonly string[], run: (part: string[]) => Promise<T[]>): Promise<T[]> {
  const parts: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) parts.push(ids.slice(i, i + CHUNK));
  return (await Promise.all(parts.map(run))).flat();
}

export class QtoError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

/** "QTO_LOCKED: this version is…" → QtoError("This version is…", "QTO_LOCKED"). */
export function toQtoError(e: { message?: string } | null | undefined): QtoError {
  const raw = e?.message ?? "Something went wrong";
  const m = /^(QTO_[A-Z_]+):\s*([\s\S]*)$/.exec(raw);
  if (!m) return new QtoError(raw, null);
  const text = m[2].trim();
  return new QtoError(text.charAt(0).toUpperCase() + text.slice(1), m[1]);
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw toQtoError(res.error);
  return res.data;
}

const db = () => createClient();

// ── Sessions ────────────────────────────────────────────────────────────────

export interface SessionListRow extends QtoSession {
  current_version: QtoSessionVersion | null;
  latest_publication: Pick<QtoPublication, "id" | "version_id" | "published_at" | "snapshot_hash" | "item_count"> | null;
}

export async function listSessions(tenderId: string): Promise<SessionListRow[]> {
  const sessions = check(await db().from("qto_sessions").select("*").eq("tender_id", tenderId)
    .eq("is_deleted", false).order("session_code")) as QtoSession[];
  if (sessions.length === 0) return [];
  const ids = sessions.map((s) => s.id);
  const [versions, pubs] = await Promise.all([
    inChunks(ids, async (chunk) => check(await db().from("qto_session_versions").select("*").in("session_id", chunk)) as QtoSessionVersion[]),
    inChunks(ids, async (chunk) => check(await db().from("qto_publications")
      .select("id,version_id,session_id,published_at,snapshot_hash,item_count").in("session_id", chunk)) as (QtoPublication)[]),
  ]);
  const byId = new Map(versions.map((v) => [v.id, v]));
  return sessions.map((s) => ({
    ...s,
    current_version: s.current_version_id ? byId.get(s.current_version_id) ?? null : null,
    latest_publication: pubs.filter((p) => p.session_id === s.id)
      .sort((a, b) => b.published_at.localeCompare(a.published_at))[0] ?? null,
  }));
}

export interface SessionBundle {
  session: QtoSession;
  versions: QtoSessionVersion[];
  reviews: QtoVersionReview[];
  publications: QtoPublication[];
  transfers: QtoTransfer[];
}

export async function getSessionBundle(sessionId: string): Promise<SessionBundle> {
  const session = check(await db().from("qto_sessions").select("*").eq("id", sessionId).maybeSingle()) as QtoSession | null;
  if (!session) throw new QtoError("Session not found, or you do not have access to it", "QTO_NOT_FOUND");
  const [versions, publications] = await Promise.all([
    db().from("qto_session_versions").select("*").eq("session_id", sessionId).order("version_no").then(check),
    db().from("qto_publications").select("*").eq("session_id", sessionId).order("published_at").then(check),
  ]) as [QtoSessionVersion[], QtoPublication[]];
  const [reviews, transfers] = await Promise.all([
    versions.length ? db().from("qto_version_reviews").select("*").in("version_id", versions.map((v) => v.id))
      .order("created_at").then(check) : Promise.resolve([]),
    publications.length ? db().from("qto_transfers").select("*").in("publication_id", publications.map((p) => p.id))
      .order("created_at", { ascending: false }).then(check) : Promise.resolve([]),
  ]) as [QtoVersionReview[], QtoTransfer[]];
  return { session, versions, reviews, publications, transfers };
}

export interface CreateSessionInput {
  tenderId: string;
  name: string;
  drawingRevisionId: string;
  rulesetVersionId: string;
  trade?: string | null;
  building?: string | null;
  description?: string | null;
  scope?: string | null;
  responsibleQs?: string | null;
}

export async function createSession(i: CreateSessionInput): Promise<string> {
  return check(await db().rpc("qto_create_session", {
    p_tender_id: i.tenderId, p_name: i.name, p_drawing_revision_id: i.drawingRevisionId,
    p_ruleset_version_id: i.rulesetVersionId, p_trade: i.trade ?? null, p_building: i.building ?? null,
    p_description: i.description ?? null, p_scope: i.scope ?? null, p_responsible_qs: i.responsibleQs ?? null,
    p_purpose: "TENDER",
  })) as string;
}

export async function createVersion(i: {
  sessionId: string; reason: string; drawingRevisionId: string; rulesetVersionId: string; carryItemIds: string[];
}): Promise<string> {
  return check(await db().rpc("qto_create_version", {
    p_session_id: i.sessionId, p_reason: i.reason, p_drawing_revision_id: i.drawingRevisionId,
    p_ruleset_version_id: i.rulesetVersionId, p_carry_item_ids: i.carryItemIds,
  })) as string;
}

export async function transitionVersion(versionId: string, to: Exclude<VersionStatus, "PUBLISHED" | "DRAFT">, comment?: string) {
  return check(await db().rpc("qto_version_transition", {
    p_version_id: versionId, p_to_status: to, p_comment: comment?.trim() || null,
  })) as string;
}

export async function publishVersion(versionId: string): Promise<string> {
  return check(await db().rpc("qto_publish_version", { p_version_id: versionId })) as string;
}

export async function transferToTenderBoq(i: {
  publicationId: string; tenderId: string; idempotencyKey: string; includeProvisional: boolean; allowOverwrite: boolean;
}): Promise<QtoTransfer> {
  return check(await db().rpc("qto_transfer_to_tender_boq", {
    p_publication_id: i.publicationId, p_tender_id: i.tenderId, p_idempotency_key: i.idempotencyKey,
    p_include_provisional: i.includeProvisional, p_allow_overwrite: i.allowOverwrite,
  })) as QtoTransfer;
}

export function newIdempotencyKey(publicationId: string): string {
  return `qto:${publicationId}:${crypto.randomUUID()}`;
}

// ── Version workspace ───────────────────────────────────────────────────────

export interface MeasurementRow {
  id: string;
  qto_item_id: string;
  drawing_revision_id: string | null;
  page_no: number | null;
  measure_type: string;
  points: { x: number; y: number }[];
  length: number | null;
  area: number | null;
  count: number | null;
  unit: string | null;
  label: string | null;
  calibration_id: string | null;
  created_at: string;
}

export interface VersionWorkspace {
  items: TakeoffItem[];
  factors: QtoItemFactor[];
  runs: QtoCalculationRunRow[];
  issues: QtoIssue[];
  measurements: MeasurementRow[];
  boqLinks: { qto_item_id: string; boq_item_id: string; quantity: number; transfer_id: string | null }[];
}

export async function getVersionWorkspace(versionId: string): Promise<VersionWorkspace> {
  const [items, issues] = await Promise.all([
    db().from("qto_items").select("*").eq("session_version_id", versionId).eq("is_deleted", false).order("qto_no").then(check),
    db().from("qto_issues").select("*").eq("version_id", versionId).order("created_at").then(check),
  ]) as [TakeoffItem[], QtoIssue[]];
  const ids = items.map((i) => i.id);
  if (ids.length === 0) return { items, factors: [], runs: [], issues, measurements: [], boqLinks: [] };
  const [factors, runs, measurements, boqLinks] = await Promise.all([
    inChunks(ids, async (c) => check(await db().from("qto_item_factors").select("*").in("item_id", c).order("sequence")) as QtoItemFactor[]),
    inChunks(ids, async (c) => check(await db().from("qto_calculation_runs").select("*").in("item_id", c)
      .order("created_at", { ascending: false })) as QtoCalculationRunRow[]),
    inChunks(ids, async (c) => check(await db().from("qto_measurements").select("*").in("qto_item_id", c).order("created_at")) as MeasurementRow[]),
    inChunks(ids, async (c) => check(await db().from("qto_boq_links").select("qto_item_id,boq_item_id,quantity,transfer_id")
      .in("qto_item_id", c)) as VersionWorkspace["boqLinks"]),
  ]);
  return { items, factors, runs, issues, measurements, boqLinks };
}

export type ItemFields = Partial<Pick<TakeoffItem,
  "item_code" | "description" | "unit" | "quantity" | "quantity_status" | "exclusion_reason" | "provisional_assumption" |
  "building" | "level" | "zone" | "discipline" | "work_section" | "element" | "wbs_node_id" | "budget_code_id" |
  "rule_code" | "drawing_id" | "drawing_revision_id" | "page_no" | "grid_location" | "carry_status" | "remarks" |
  "display_color" | "display_opacity">>;

export async function createItem(version: QtoSessionVersion, tenderId: string, fields: ItemFields): Promise<TakeoffItem> {
  const client = db();
  // qto_no is unique within a version; retry once if a parallel insert took the number.
  for (let attempt = 0; attempt < 2; attempt++) {
    const qtoNo = check(await client.rpc("qto_next_no", { p_tender_id: tenderId })) as string;
    const { data: { user } } = await client.auth.getUser();
    const res = await client.from("qto_items").insert({
      tender_id: tenderId,
      session_version_id: version.id,
      qto_no: qtoNo,
      description: fields.description ?? "New item",
      unit: fields.unit ?? "m2",
      quantity: 0,
      quantity_status: "FIRM",
      drawing_revision_id: version.drawing_revision_id,
      page_no: 1,
      measurement_method: "measure",
      prepared_by: user?.id ?? null,
      prepared_date: new Date().toISOString(),
      ...fields,
    }).select("*").single();
    if (!res.error) return res.data as TakeoffItem;
    if (!/qto_items_version_no_uq/.test(res.error.message) || attempt === 1) throw toQtoError(res.error);
  }
  throw new QtoError("Could not allocate a QTO number", null);
}

export async function updateItem(id: string, patch: ItemFields): Promise<void> {
  check(await db().from("qto_items").update(patch).eq("id", id));
}

/** Soft delete (BR-03: only a System Administrator hard-deletes). */
export async function deleteItem(id: string): Promise<void> {
  check(await db().from("qto_items").update({ is_deleted: true }).eq("id", id));
}

export async function duplicateItem(version: QtoSessionVersion, item: TakeoffItem): Promise<TakeoffItem> {
  const copy = await createItem(version, item.tender_id, {
    item_code: item.item_code, description: `${item.description} (copy)`, unit: item.unit,
    quantity_status: item.quantity_status, provisional_assumption: item.provisional_assumption,
    exclusion_reason: item.exclusion_reason, building: item.building, level: item.level, zone: item.zone,
    discipline: item.discipline, work_section: item.work_section, element: item.element, wbs_node_id: item.wbs_node_id,
    budget_code_id: item.budget_code_id, rule_code: item.rule_code, drawing_revision_id: item.drawing_revision_id,
    page_no: item.page_no, grid_location: item.grid_location,
  });
  return copy;
}

export async function setFactors(itemId: string, factors: { name: string; value: string; reason?: string | null }[]) {
  const client = db();
  check(await client.from("qto_item_factors").delete().eq("item_id", itemId));
  if (factors.length === 0) return;
  check(await client.from("qto_item_factors").insert(factors.map((f, i) => ({
    item_id: itemId, factor_name: f.name, factor_value: f.value, sequence: i + 1, reason: f.reason ?? null,
  }))));
}

export async function recordCalculation(itemId: string, run: CalculationRun, meta?: Record<string, unknown>): Promise<string> {
  return check(await db().rpc("qto_record_calculation", { p_item_id: itemId, p_run: toRunPayload(run, meta) })) as string;
}

export async function addMeasurement(itemId: string, m: {
  drawing_revision_id: string | null; drawing_id: string | null; page_no: number; measure_type: string;
  points: { x: number; y: number }[]; length: number | null; area: number | null; count: number | null;
  unit: string | null; label: string | null; calibration_id: string | null;
  source_format?: "pdf" | "dxf" | "dwg" | null; source_entity_handles?: string[] | null; source_layer?: string | null;
  source_block?: string | null; source_selection?: Record<string, unknown> | null;
}): Promise<MeasurementRow> {
  return check(await db().from("qto_measurements").insert({ qto_item_id: itemId, ...m }).select("*").single()) as MeasurementRow;
}

export async function deleteMeasurement(id: string): Promise<void> {
  check(await db().from("qto_measurements").delete().eq("id", id));
}

export async function syncIssues(versionId: string, issues: ValidationIssue[]): Promise<{ open: number; resolved: number }> {
  return check(await db().rpc("qto_sync_issues", { p_version_id: versionId, p_issues: issues })) as { open: number; resolved: number };
}

export async function acknowledgeIssue(issueId: string, justification: string): Promise<void> {
  check(await db().rpc("qto_acknowledge_issue", { p_issue_id: issueId, p_justification: justification }));
}

/** Maps an item to a tender BOQ line before publication (the transfer then writes that line). */
export async function setBoqLink(itemId: string, boqItemId: string | null, quantity: number) {
  const client = db();
  check(await client.from("qto_boq_links").delete().eq("qto_item_id", itemId).is("transfer_id", null));
  if (boqItemId) {
    check(await client.from("qto_boq_links").insert({ qto_item_id: itemId, boq_item_id: boqItemId, quantity }));
  }
}

export interface TenderBoqLine {
  id: string;
  section: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
}

export async function listTenderBoqLines(tenderId: string): Promise<TenderBoqLine[]> {
  return check(await db().from("tender_boq_items").select("id,section,item_code,description,unit,quantity")
    .eq("tender_id", tenderId).order("sort_order").order("item_code")) as TenderBoqLine[];
}

export async function listWbsNodesForTender(projectId: string | null) {
  if (!projectId) return [];
  return check(await db().from("wbs_nodes").select("id,wbs_code,wbs_name,node_type").eq("project_id", projectId)
    .order("wbs_code")) as { id: string; wbs_code: string | null; wbs_name: string | null; node_type: string }[];
}

// ── Calibration ─────────────────────────────────────────────────────────────

export async function getActiveCalibrations(revisionId: string): Promise<QtoCalibration[]> {
  return check(await db().from("qto_drawing_calibrations").select("*").eq("drawing_revision_id", revisionId)
    .eq("is_active", true)) as QtoCalibration[];
}

export async function saveCalibration(i: {
  revisionId: string; pageNo: number; points: { x: number; y: number }[]; pixelDistance: number;
  knownDistance: number; knownUnit: "mm" | "cm" | "m";
}): Promise<string> {
  return check(await db().rpc("qto_save_calibration", {
    p_drawing_revision_id: i.revisionId, p_page_no: i.pageNo, p_points: i.points, p_pixel_distance: i.pixelDistance,
    p_known_distance: i.knownDistance, p_known_unit: i.knownUnit,
  })) as string;
}

/** Scale of a CAD revision from its drawing units (metres per sheet unit), recorded as method cad_units. */
export async function saveCadCalibration(revisionId: string, metresPerUnit: number): Promise<string> {
  return check(await db().rpc("qto_save_cad_calibration", { p_drawing_revision_id: revisionId, p_metres_per_unit: metresPerUnit })) as string;
}

/** Stores the CAD summary (and its frame) on a revision the first time it is opened. */
export async function saveCadMeta(revisionId: string, meta: Record<string, unknown>): Promise<void> {
  check(await db().from("qto_drawing_revisions").update({ cad_meta: meta }).eq("id", revisionId).is("cad_meta", null).select("id"));
}

// ── Rulesets ────────────────────────────────────────────────────────────────

export interface RulesetWithVersions extends QtoRuleset {
  versions: QtoRuleVersion[];
}

export async function listRulesets(): Promise<RulesetWithVersions[]> {
  const [sets, versions] = await Promise.all([
    db().from("qto_measurement_rulesets").select("*").order("code").then(check),
    db().from("qto_measurement_rule_versions").select("*").order("version_no").then(check),
  ]) as [QtoRuleset[], QtoRuleVersion[]];
  return sets.map((s) => ({ ...s, versions: versions.filter((v) => v.ruleset_id === s.id) }));
}

export async function getRuleVersion(id: string): Promise<QtoRuleVersion | null> {
  return check(await db().from("qto_measurement_rule_versions").select("*").eq("id", id).maybeSingle()) as QtoRuleVersion | null;
}

export async function createRuleset(i: { code: string; name: string; description?: string; standard?: string }): Promise<string> {
  const row = check(await db().from("qto_measurement_rulesets").insert({
    code: i.code.trim(), name: i.name.trim(), description: i.description ?? null, standard: i.standard ?? null,
  }).select("id").single()) as { id: string };
  return row.id;
}

export async function createRuleDraft(rulesetId: string, definition: RulesetDefinition, changeNote: string): Promise<string> {
  const { data: last } = await db().from("qto_measurement_rule_versions").select("version_no")
    .eq("ruleset_id", rulesetId).order("version_no", { ascending: false }).limit(1).maybeSingle();
  const row = check(await db().from("qto_measurement_rule_versions").insert({
    ruleset_id: rulesetId, version_no: ((last as { version_no: number } | null)?.version_no ?? 0) + 1,
    status: "draft", definition, change_note: changeNote,
  }).select("id").single()) as { id: string };
  return row.id;
}

export async function setRuleVersionStatus(id: string, status: "approved" | "retired"): Promise<void> {
  check(await db().from("qto_measurement_rule_versions").update({ status }).eq("id", id));
}

// ── Dashboard and audit ─────────────────────────────────────────────────────

export interface QtoDashboard {
  sessions: number;
  byStatus: Record<VersionStatus, number>;
  openBlocking: number;
  openWarnings: number;
  provisionalItems: number;
  publications: { id: string; session_id: string; published_at: string; item_count: number }[];
  failedTransfers: { id: string; publication_id: string; created_at: string; error: string | null }[];
}

export async function getDashboard(sessions: SessionListRow[]): Promise<QtoDashboard> {
  const byStatus = { DRAFT: 0, IN_PROGRESS: 0, SUBMITTED_FOR_REVIEW: 0, CHANGES_REQUESTED: 0, APPROVED: 0, PUBLISHED: 0, CANCELLED: 0 };
  for (const s of sessions) if (s.current_version) byStatus[s.current_version.status]++;
  const versionIds = sessions.map((s) => s.current_version_id).filter((v): v is string => !!v);
  const sessionIds = sessions.map((s) => s.id);
  if (versionIds.length === 0) {
    return { sessions: sessions.length, byStatus, openBlocking: 0, openWarnings: 0, provisionalItems: 0, publications: [], failedTransfers: [] };
  }
  const [issues, provisional, publications] = await Promise.all([
    inChunks(versionIds, async (c) => check(await db().from("qto_issues").select("severity").in("version_id", c).eq("status", "open")) as { severity: string }[]),
    inChunks(versionIds, async (c) => check(await db().from("qto_items").select("id").in("session_version_id", c)
      .eq("quantity_status", "PROVISIONAL").eq("is_deleted", false)) as { id: string }[]),
    inChunks(sessionIds, async (c) => check(await db().from("qto_publications").select("id,session_id,published_at,item_count")
      .in("session_id", c)) as QtoDashboard["publications"]),
  ]);
  const failedTransfers = publications.length
    ? await inChunks(publications.map((p) => p.id), async (c) => check(await db().from("qto_transfers")
        .select("id,publication_id,created_at,error").in("publication_id", c).eq("status", "failed")
        .order("created_at", { ascending: false }).limit(10)) as QtoDashboard["failedTransfers"])
    : [];
  return {
    sessions: sessions.length,
    byStatus,
    openBlocking: issues.filter((i) => i.severity === "BLOCKING").length,
    openWarnings: issues.filter((i) => i.severity === "WARNING").length,
    provisionalItems: provisional.length,
    publications: publications.sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 5),
    failedTransfers: failedTransfers.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5),
  };
}

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}

export async function getAuditHistory(recordIds: string[], limit = 200): Promise<AuditEntry[]> {
  if (recordIds.length === 0) return [];
  const rows = await inChunks(recordIds, async (c) => check(await db().from("qto_audit_log").select("*")
    .in("record_id", c).order("changed_at", { ascending: false }).limit(limit)) as AuditEntry[]);
  return rows.sort((a, b) => b.changed_at.localeCompare(a.changed_at)).slice(0, limit);
}

/** Exports are audited like other workflow actions. */
export async function logExport(publicationId: string, format: "xlsx" | "csv", rows: number) {
  const client = db();
  const { data: { user } } = await client.auth.getUser();
  await client.from("qto_audit_log").insert({
    table_name: "qto_publications", record_id: publicationId, action: "EXPORT",
    new_data: { format, rows }, changed_by: user?.id ?? null,
  });
}

export async function getProfileNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const rows = await inChunks(unique, async (c) => check(await db().from("profiles").select("id,full_name,email").in("id", c)) as
    { id: string; full_name: string | null; email: string | null }[]);
  return Object.fromEntries(rows.map((r) => [r.id, r.full_name || r.email || r.id.slice(0, 8)]));
}

// ── Tender and drawing lookups ──────────────────────────────────────────────

export async function getTender(tenderId: string) {
  return check(await db().from("tender_register").select("id,tender_no,title,project_id").eq("id", tenderId).maybeSingle()) as
    { id: string; tender_no: string; title: string; project_id: string | null } | null;
}

export interface RevisionOption {
  id: string;
  drawing_id: string;
  revision: string;
  status: string;
  pdf_path: string | null;
  file_path: string | null;
  scale: string | null;
  created_at: string;
  source_format: "pdf" | "dxf" | "dwg" | null;
  cad_path: string | null;
  cad_units: "mm" | "cm" | "m" | "in" | "ft" | null;
  cad_meta: Record<string, unknown> | null;
  conversion_status: string | null;
}

/** Every revision of every drawing of a tender, oldest first. */
export async function listTenderRevisions(tenderId: string): Promise<RevisionOption[]> {
  return check(await db().from("qto_drawing_revisions")
    .select("id,drawing_id,revision,status,pdf_path,file_path,scale,created_at,source_format,cad_path,cad_units,cad_meta,conversion_status,drawing:qto_drawing_register!qto_drawing_revisions_drawing_id_fkey!inner(tender_id)")
    .eq("drawing.tender_id", tenderId).order("created_at")) as RevisionOption[];
}

/** New geometry for a measurement after its grips were dragged (only while the version is editable). */
export async function updateMeasurementGeometry(id: string, patch: { points: { x: number; y: number }[]; length: number | null; area: number | null }) {
  check(await db().from("qto_measurements").update(patch).eq("id", id));
}
