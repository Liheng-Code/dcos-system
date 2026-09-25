import { createClient } from "@/lib/supabase/client";
import { getBaselineSnapshot, listBaselines } from "./baseline-service";
import { parseISO, toISO } from "./work-calendar";

export type ComparisonSource =
  | { kind: "live" }
  | { kind: "baseline"; baselineNumber: number }
  | { kind: "revision"; revisionId: string };

export interface ComparisonSourceOption {
  key: string;
  label: string;
  source: ComparisonSource;
}

export interface TaskSnapshot {
  start: string | null;
  end: string | null;
  cost: number | null;
}

export interface MultiCompareRow {
  task_id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  /** Keyed by the caller-supplied source `key` (e.g. "A", "B", "C"). */
  values: Record<string, TaskSnapshot>;
}

interface RawSnapshotTask {
  id: string;
  start_date: string | null;
  end_date: string | null;
  budget_cost: number | null;
}

export type RevisionStatus = "draft" | "submitted_internal" | "approved_internal" | "submitted_client" | "approved_client" | "rejected";

export interface ScheduleStreamRevision {
  id: string;
  revision_number: number;
  note: string | null;
  created_at: string;
  /** Completion Plan 2.3 — approval workflow. */
  status: RevisionStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  decision_comment: string | null;
  transmittal_id: string | null;
}

export interface ScheduleStream {
  id: string;
  project_id: string;
  stream_type: "internal" | "external";
  name: string;
  created_at: string;
  revisions: ScheduleStreamRevision[];
}

/** Every schedule a project can be compared from: Live, every saved baseline, every stream revision. */
export async function listComparisonSources(projectId: string): Promise<ComparisonSourceOption[]> {
  const supabase = createClient();
  const out: ComparisonSourceOption[] = [{ key: "live", label: "Live / Current", source: { kind: "live" } }];

  // listBaselines and the revisions query are independent — run concurrently.
  const [baselines, { data, error }] = await Promise.all([
    listBaselines(projectId),
    supabase
      .from("plan_schedule_revisions")
      .select("id, revision_number, plan_schedule_streams!inner(name, project_id)")
      .eq("plan_schedule_streams.project_id", projectId)
      .order("revision_number"),
  ]);
  for (const b of baselines) {
    if (b.task_count === 0) continue;
    out.push({
      key: `baseline:${b.baseline_number}`,
      label: b.baseline_name + (b.is_active ? " (active)" : ""),
      source: { kind: "baseline", baselineNumber: b.baseline_number },
    });
  }
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const stream = r.plan_schedule_streams as unknown as { name: string };
    out.push({
      key: `revision:${r.id}`,
      label: `${stream.name} — Rev ${r.revision_number}`,
      source: { kind: "revision", revisionId: r.id as string },
    });
  }
  return out;
}

export async function resolveSource(projectId: string, source: ComparisonSource): Promise<Map<string, TaskSnapshot>> {
  const map = new Map<string, TaskSnapshot>();

  if (source.kind === "live") {
    // Same cap as use-sheet-data.ts's TASK_LIMIT — without an explicit .limit(),
    // PostgREST's default 1000-row cap would silently truncate a >1000-task
    // project's comparison instead of erroring.
    const { data, error } = await createClient()
      .from("wbs_tasks")
      .select("id, start_date, end_date, budget_cost")
      .eq("project_id", projectId)
      .limit(1000);
    if (error) throw new Error(error.message);
    for (const t of data ?? []) {
      map.set(t.id as string, {
        start: t.start_date as string | null,
        end: t.end_date as string | null,
        cost: (t.budget_cost as number | null) ?? null,
      });
    }
    return map;
  }

  if (source.kind === "baseline") {
    const tasks = await getBaselineSnapshot(projectId, source.baselineNumber);
    for (const t of tasks) map.set(t.id, { start: t.start_date, end: t.end_date, cost: t.budget_cost });
    return map;
  }

  const { data, error } = await createClient()
    .from("plan_schedule_revisions")
    .select("snapshot_data")
    .eq("id", source.revisionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const snap = (data?.snapshot_data as { tasks?: RawSnapshotTask[] } | null) ?? null;
  for (const t of snap?.tasks ?? []) map.set(t.id, { start: t.start_date, end: t.end_date, cost: t.budget_cost });
  return map;
}

/** Diffs 2–3 named sources per task. Rows with no data in ANY source are omitted. */
export async function compareSchedules(
  projectId: string,
  sources: { key: string; source: ComparisonSource }[],
): Promise<MultiCompareRow[]> {
  const [{ data: taskRows, error }, ...resolved] = await Promise.all([
    createClient().from("wbs_tasks").select("id, task_code, task_name, discipline").eq("project_id", projectId),
    ...sources.map((s) => resolveSource(projectId, s.source)),
  ]);
  if (error) throw new Error(error.message);

  const rows: MultiCompareRow[] = [];
  for (const t of taskRows ?? []) {
    const values: Record<string, TaskSnapshot> = {};
    let anyPresent = false;
    sources.forEach((s, i) => {
      const snap = resolved[i].get(t.id as string);
      if (snap) anyPresent = true;
      values[s.key] = snap ?? { start: null, end: null, cost: null };
    });
    if (!anyPresent) continue;
    rows.push({
      task_id: t.id as string,
      task_code: t.task_code as string,
      task_name: t.task_name as string,
      discipline: (t.discipline as string | null) ?? null,
      values,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Stream management (Internal / External schedules)
// ---------------------------------------------------------------------------

/** Every Internal/External schedule stream for a project, with its revision history. */
export async function listScheduleStreams(projectId: string): Promise<ScheduleStream[]> {
  const { data, error } = await createClient()
    .from("plan_schedule_streams")
    .select("id, project_id, stream_type, name, created_at, plan_schedule_revisions(id, revision_number, note, created_at, status, submitted_by, submitted_at, decision_comment, transmittal_id)")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: s.id as string,
    project_id: s.project_id as string,
    stream_type: s.stream_type as "internal" | "external",
    name: s.name as string,
    created_at: s.created_at as string,
    revisions: ((s.plan_schedule_revisions as unknown as ScheduleStreamRevision[]) ?? []).sort(
      (a, b) => a.revision_number - b.revision_number,
    ),
  }));
}

export async function createScheduleStream(
  projectId: string,
  streamType: "internal" | "external",
  name: string,
): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("plan_schedule_streams")
    .insert({ project_id: projectId, stream_type: streamType, name, created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Rename a stream. Allowed for any authenticated user (mirrors the table's UPDATE policy). */
export async function renameScheduleStream(streamId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty.");
  const { error } = await createClient()
    .from("plan_schedule_streams")
    .update({ name: trimmed })
    .eq("id", streamId);
  if (error) throw new Error(error.message);
}

/** Delete a whole stream and its revisions (cascade). Admin-only at the RLS layer. */
export async function deleteScheduleStream(streamId: string): Promise<void> {
  const { error } = await createClient().from("plan_schedule_streams").delete().eq("id", streamId);
  if (error) throw new Error(error.message);
}

/** Delete one revision. Admin-only at the RLS layer. Leaves any lower revisions untouched. */
export async function deleteScheduleRevision(revisionId: string): Promise<void> {
  const { error } = await createClient().from("plan_schedule_revisions").delete().eq("id", revisionId);
  if (error) throw new Error(error.message);
}

/** Edit a revision's note only — the captured dates stay frozen. */
export async function updateScheduleRevisionNote(revisionId: string, note: string): Promise<void> {
  const { error } = await createClient()
    .from("plan_schedule_revisions")
    .update({ note: note.trim() || null })
    .eq("id", revisionId);
  if (error) throw new Error(error.message);
}

/** Snapshots the current live schedule into a new revision of `streamId`. Returns the new revision number. */
export async function captureScheduleRevision(streamId: string, note?: string): Promise<number> {
  const { data, error } = await createClient().rpc("capture_schedule_revision", {
    p_stream_id: streamId,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export type RevisionAction = "submit" | "approve" | "reject" | "submit_client" | "client_approve" | "client_reject";

/** Completion Plan 2.3 — draft -> submitted_internal -> approved_internal -> submitted_client -> approved_client | rejected. */
export async function transitionRevision(
  revisionId: string,
  action: RevisionAction,
  comment?: string,
): Promise<{ status: RevisionStatus; baseline_number?: number; baseline_type?: string }> {
  const { data, error } = await createClient().rpc("transition_revision", {
    p_revision_id: revisionId,
    p_action: action,
    p_comment: comment ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { status: RevisionStatus; baseline_number?: number; baseline_type?: string };
}

/** Completion Plan 2.3 — files a client-approved revision as a Document Control transmittal. */
export async function createProgrammeTransmittal(
  revisionId: string,
  issuerCompanyId: string,
  receiverStakeholderId: string,
): Promise<{ transmittal_id: string; transmittal_code: string; document_id: string; document_number: string }> {
  const { data, error } = await createClient().rpc("create_programme_transmittal", {
    p_revision_id: revisionId,
    p_issuer_company_id: issuerCompanyId,
    p_receiver_stakeholder_id: receiverStakeholderId,
  });
  if (error) throw new Error(error.message);
  return data as { transmittal_id: string; transmittal_code: string; document_id: string; document_number: string };
}

// ---------------------------------------------------------------------------
// Derive a new revision from another schedule, shifted earlier/later
// ---------------------------------------------------------------------------

export type ShiftUnit = "days" | "weeks" | "months";

/** UTC-pinned so shifting never drifts a day by timezone (same convention as work-calendar.ts). */
function shiftISODate(iso: string | null, amount: number, unit: ShiftUnit): string | null {
  if (!iso) return null;
  const d = parseISO(iso);
  if (unit === "days") d.setUTCDate(d.getUTCDate() + amount);
  else if (unit === "weeks") d.setUTCDate(d.getUTCDate() + amount * 7);
  else d.setUTCMonth(d.getUTCMonth() + amount);
  return toISO(d);
}

export interface DeriveRevisionInput {
  projectId: string;
  /** Where to read the "before" dates/cost from (e.g. the Baseline, or another stream's revision). */
  fromSource: ComparisonSource;
  /** Which stream the new, shifted revision is saved into (must already exist). */
  targetStreamId: string;
  shiftAmount: number;
  shiftUnit: ShiftUnit;
  shiftDirection: "earlier" | "later";
  note?: string;
}

/**
 * Reads `fromSource`'s per-task dates, shifts every task's start/end by the
 * given amount, and saves the result as a new revision on `targetStreamId` —
 * a snapshot only, never touches the live `wbs_tasks` dates. Built for the
 * common "Internal schedule starts 2 months ahead of the Baseline" pattern:
 * derive it in one step instead of retyping every date by hand.
 */
export async function deriveScheduleRevision(input: DeriveRevisionInput): Promise<number> {
  const source = await resolveSource(input.projectId, input.fromSource);
  const signedAmount = input.shiftDirection === "earlier" ? -input.shiftAmount : input.shiftAmount;

  const tasks = [...source.entries()].map(([id, snap]) => ({
    id,
    start_date: shiftISODate(snap.start, signedAmount, input.shiftUnit),
    end_date: shiftISODate(snap.end, signedAmount, input.shiftUnit),
    budget_cost: snap.cost,
  }));

  const supabase = createClient();
  const { data: maxRow, error: maxError } = await supabase
    .from("plan_schedule_revisions")
    .select("revision_number")
    .eq("stream_id", input.targetStreamId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(maxError.message);
  const revisionNumber = (maxRow?.revision_number ?? 0) + 1;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("plan_schedule_revisions").insert({
    stream_id: input.targetStreamId,
    revision_number: revisionNumber,
    note: input.note ?? null,
    snapshot_data: {
      captured_at: new Date().toISOString(),
      tasks,
      derived_from: input.fromSource,
      shift: { amount: input.shiftAmount, unit: input.shiftUnit, direction: input.shiftDirection },
    },
    created_by: user?.id ?? null,
  });
  if (error) throw new Error(error.message);
  return revisionNumber;
}
