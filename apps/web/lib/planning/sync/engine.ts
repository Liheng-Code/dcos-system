// Sync engine: orchestrates preview → commit for imports and builds exports.
// Server-side only (uses a SupabaseClient with admin privileges). The imported
// schedule is the normalized payload produced by mspd-parser on the client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommitResult,
  DiffPlan,
  MspSchedule,
  SyncConfigRow,
} from "./types";
import { detectChanges, type ExistingTask } from "./change-detection";
import { buildMspdXml, type ExportTask } from "./export-xml";
import { broadcastScheduleSync } from "./realtime";

type DB = SupabaseClient;

interface SessionRow {
  id: string;
  project_id: string;
  status: string;
  direction: string;
  source_hash: string | null;
}

interface EventRow {
  id: string;
  action: string;
  msp_uid: string | null;
  outline_number: string | null;
  wbs_task_id: string | null;
  changes: Record<string, unknown>;
}

const DEFAULT_SETTINGS = {
  mode: "merge" as const,
  syncLevel: 3,
  syncProgress: false,
  defaultWbsNodeId: null as string | null,
};

export async function loadSyncConfig(
  supabase: DB,
  projectId: string,
): Promise<SyncConfigRow | null> {
  const { data } = await supabase
    .from("wbs_projects_sync")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as SyncConfigRow | null) ?? null;
}

function toSettings(config: SyncConfigRow | null) {
  if (!config) return { ...DEFAULT_SETTINGS };
  return {
    mode: (config.mode ?? "merge") as "merge" | "replace",
    syncLevel: config.sync_level ?? 3,
    syncProgress: config.sync_progress ?? false,
    defaultWbsNodeId: config.default_wbs_node_id ?? null,
  };
}

async function resolveDefaultWbsNode(
  supabase: DB,
  projectId: string,
  configured: string | null,
): Promise<string | null> {
  if (configured) return configured;
  const { data } = await supabase
    .from("wbs_nodes")
    .select("id")
    .eq("project_id", projectId)
    .is("parent_id", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

async function loadExistingTasks(
  supabase: DB,
  projectId: string,
  syncLevel: number,
): Promise<ExistingTask[]> {
  const { data } = await supabase
    .from("wbs_tasks")
    .select(
      "id, task_code, task_name, msp_uid, sync_hash, start_date, end_date, description, planned_hours, progress, msp_outline_number",
    )
    .eq("project_id", projectId)
    .eq("schedule_level", syncLevel);
  return (data as ExistingTask[]) ?? [];
}

function sessionSourceHash(schedule: MspSchedule): string {
  const canonical = {
    ...schedule,
    parsedAt: undefined,
    allTasks: undefined,
    level3Tasks: schedule.level3Tasks.map((t) => ({
      uid: t.uid,
      name: t.name,
      outlineNumber: t.outlineNumber,
      start: t.start,
      finish: t.finish,
      progress: t.percentComplete,
      notes: t.notes,
      work: t.work,
      predecessors: t.predecessors,
    })),
  };
  return JSON.stringify(canonical);
}

export async function runImportPreview(
  supabase: DB,
  projectId: string,
  schedule: MspSchedule,
  userId: string | null,
): Promise<{ sessionId: string; plan: DiffPlan } | { error: string }> {
  const existingConfig = await loadSyncConfig(supabase, projectId);
  const settings = toSettings(existingConfig);

  const defaultWbsNodeId = await resolveDefaultWbsNode(
    supabase,
    projectId,
    settings.defaultWbsNodeId,
  );

  const existing = await loadExistingTasks(supabase, projectId, settings.syncLevel);
  const plan = detectChanges({
    schedule,
    existing,
    settings,
    defaultWbsNodeId,
  });

  const payload = {
    fileName: schedule.fileName ?? null,
    projectName: schedule.projectName ?? null,
    projectTitle: schedule.projectTitle ?? null,
    sourceIdentifier: schedule.sourceIdentifier ?? null,
    taskCount: schedule.taskCount,
    level3Tasks: schedule.level3Tasks,
  };
  const sourceHash = sessionSourceHash(schedule);

  const { data: session, error: sessionError } = await supabase
    .from("wbs_sync_sessions")
    .insert({
      project_id: projectId,
      direction: "import",
      status: "preview",
      file_name: schedule.fileName ?? null,
      source_hash: sourceHash,
      payload,
      summary: plan.summary,
      created_by: userId,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return { error: sessionError?.message ?? "Failed to create preview session" };
  }

  const events = plan.ops.map((op) => ({
    session_id: session.id,
    action: op.action,
    status: "pending",
    msp_uid: op.mspUid ?? null,
    outline_number: op.outlineNumber ?? null,
    wbs_task_id: op.taskId ?? null,
    changes: {
      ...(op.row ?? {}),
      ...(op.changes ? { fieldChanges: op.changes } : {}),
      sync_hash: op.incomingHash ?? null,
      dependsOnMspUid: op.dependsOnMspUid ?? null,
      dependsOnType: op.dependsOnType ?? null,
      dependsOutOfScope: op.warning ?? null,
    },
  }));

  const { error: eventsError } = await supabase.from("wbs_sync_events").insert(events);
  if (eventsError) {
    await supabase.from("wbs_sync_sessions").update({ status: "error", error: eventsError.message }).eq("id", session.id);
    return { error: eventsError.message };
  }

  await supabase
    .from("wbs_projects_sync")
    .upsert(
      {
        project_id: projectId,
        source_type: "ms_project",
        source_identifier: schedule.sourceIdentifier ?? null,
        source_name: schedule.projectName ?? schedule.fileName ?? null,
      },
      { onConflict: "project_id" },
    );

  return { sessionId: session.id, plan };
}

export async function runImportCommit(
  supabase: DB,
  projectId: string,
  sessionId: string,
  options: { discardOrphans?: boolean } = {},
): Promise<CommitResult | { error: string }> {
  const { data: session } = await supabase
    .from("wbs_sync_sessions")
    .select("id, project_id, status, direction, source_hash")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found" };
  if (session.project_id !== projectId) return { error: "Project mismatch" };
  if (session.direction !== "import") return { error: "Session is not an import" };
  if (session.status !== "preview") {
    return { error: `Session already ${session.status}` };
  }

  const { data: events } = await supabase
    .from("wbs_sync_events")
    .select("id, action, msp_uid, outline_number, wbs_task_id, changes")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (!events) return { error: "Failed to load session events" };

  const applied = { create: 0, update: 0, unchanged: 0, orphan: 0, skip: 0, discarded: 0, total: 0 };
  const errors: { mspUid: string; error: string }[] = [];
  const mspUidToTaskId = new Map<string, string>();
  const discardOrphans = options.discardOrphans === true;

  // Collect existing task codes to keep created task codes unique.
  const { data: codes } = await supabase
    .from("wbs_tasks")
    .select("task_code")
    .eq("project_id", projectId);
  const usedCodes = new Set((codes ?? []).map((r) => r.task_code as string));

  const now = new Date().toISOString();

  for (const ev of events as EventRow[]) {
    if (ev.action === "create") {
      const changes = (ev.changes ?? {}) as Record<string, unknown>;
      const wbsNodeId = (changes.wbs_node_id as string | null) ?? null;
      if (!wbsNodeId) {
        errors.push({ mspUid: ev.msp_uid ?? "", error: "No target WBS node available" });
        await markEvent(supabase, ev.id, "failed", "No target WBS node available");
        continue;
      }
      const baseCode = String(changes.task_code ?? `MSP-${ev.msp_uid ?? ev.outline_number ?? "task"}`);
      const taskCode = uniqueCode(baseCode, usedCodes);
      usedCodes.add(taskCode);

      const { data: created, error } = await supabase
        .from("wbs_tasks")
        .insert({
          project_id: projectId,
          wbs_node_id: wbsNodeId,
          task_code: taskCode,
          task_name: changes.task_name ?? ev.msp_uid,
          start_date: changes.start_date ?? null,
          end_date: changes.end_date ?? null,
          description: changes.description ?? null,
          planned_hours: changes.planned_hours ?? null,
          schedule_level: changes.schedule_level ?? 3,
          sort_order: changes.sort_order ?? 0,
          msp_uid: ev.msp_uid ?? null,
          msp_outline_number: ev.outline_number ?? null,
          sync_source: "ms_project",
          sync_hash: changes.sync_hash ?? null,
          last_synced_at: now,
        })
        .select("id")
        .single();

      if (error || !created) {
        errors.push({ mspUid: ev.msp_uid ?? "", error: error?.message ?? "Insert failed" });
        await markEvent(supabase, ev.id, "failed", error?.message);
        continue;
      }
      if (ev.msp_uid) mspUidToTaskId.set(ev.msp_uid, created.id as string);
      applied.create++;
      await markEvent(supabase, ev.id, "applied");
    }

    if (ev.action === "update") {
      const changes = ((ev.changes ?? {}).fieldChanges ?? []) as Array<{
        field: string;
        to: string | number | null;
      }>;
      const payload: Record<string, unknown> = { last_synced_at: now, sync_source: "ms_project" };
      for (const c of changes) {
        if (c.field && c.to !== undefined) payload[c.field] = c.to;
      }
      if (ev.msp_uid) payload.msp_uid = ev.msp_uid;
      if (ev.outline_number) payload.msp_outline_number = ev.outline_number;
      if (ev.wbs_task_id) {
        const { error } = await supabase
          .from("wbs_tasks")
          .update(payload)
          .eq("id", ev.wbs_task_id)
          .eq("project_id", projectId);
        if (error) {
          errors.push({ mspUid: ev.msp_uid ?? "", error: error.message });
          await markEvent(supabase, ev.id, "failed", error.message);
          continue;
        }
        if (ev.msp_uid) mspUidToTaskId.set(ev.msp_uid, ev.wbs_task_id);
      }
      applied.update++;
      await markEvent(supabase, ev.id, "applied");
    }

    if (ev.action === "orphan") {
      if (discardOrphans && ev.wbs_task_id) {
        const { error } = await supabase
          .from("wbs_tasks")
          .delete()
          .eq("id", ev.wbs_task_id)
          .eq("project_id", projectId);
        if (error) {
          errors.push({ mspUid: ev.msp_uid ?? "", error: error.message });
          await markEvent(supabase, ev.id, "failed", error.message);
          continue;
        }
        applied.discarded++;
        applied.orphan++;
        await markEvent(supabase, ev.id, "discarded");
      }
    }
  }

  // Resolve dependencies in a second pass (created ids now known).
  const { data: depEvents } = await supabase
    .from("wbs_sync_events")
    .select("id, changes, wbs_task_id, msp_uid")
    .eq("session_id", sessionId);
  for (const ev of (depEvents ?? []) as Array<{
    id: string;
    changes: Record<string, unknown>;
    wbs_task_id: string | null;
  }>) {
    if (!ev.wbs_task_id) continue;
    const dependsOnUid = (ev.changes.dependsOnMspUid as string | null) ?? null;
    const dependsOnType = (ev.changes.dependsOnType as string | null) ?? null;
    const outOfScope = (ev.changes.dependsOutOfScope as string | null) ?? null;
    const update: Record<string, unknown> = {};
    if (dependsOnUid && mspUidToTaskId.has(dependsOnUid)) {
      // Add the link to the task's predecessor list (kept if already there).
      const predId = mspUidToTaskId.get(dependsOnUid) as string;
      const { data: cur } = await supabase
        .from("wbs_tasks")
        .select("dependency_task_ids, dependency_types, dependency_lag_days")
        .eq("id", ev.wbs_task_id)
        .maybeSingle();
      const ids = (cur?.dependency_task_ids as string[] | null) ?? [];
      if (!ids.includes(predId)) {
        const types = ids.map((_, i) => ((cur?.dependency_types as string[] | null) ?? [])[i] ?? "fs");
        const lags = ids.map((_, i) => Number(((cur?.dependency_lag_days as number[] | null) ?? [])[i] ?? 0));
        update.dependency_task_ids = [...ids, predId];
        update.dependency_types = [...types, (dependsOnType ?? "FS").toLowerCase()];
        update.dependency_lag_days = [...lags, 0];
      }
      update.dependency_text = null;
    } else if (outOfScope) {
      update.dependency_text = outOfScope;
    }
    if (Object.keys(update).length) {
      await supabase.from("wbs_tasks").update(update).eq("id", ev.wbs_task_id);
    }
  }

  // Non-mutating ops (unchanged / skip / orphan flags) are marked skipped.
  // Orphan events already processed above (discarded) are left untouched.
  await supabase
    .from("wbs_sync_events")
    .update({ status: "skipped", applied_at: now })
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .in("action", ["unchanged", "skip", "orphan"]);

  const summary = { ...applied, total: events.length };
  const { error: sessError } = await supabase
    .from("wbs_sync_sessions")
    .update({ status: "committed", committed_at: now, summary })
    .eq("id", sessionId);

  if (!sessError) {
    const sessionRow = session as SessionRow;
    await supabase
      .from("wbs_projects_sync")
      .upsert(
        {
          project_id: projectId,
          status: "active",
          last_synced_at: now,
          last_sync_hash: sessionRow.source_hash,
        },
        { onConflict: "project_id" },
      );
    await broadcastScheduleSync(supabase, projectId, { sessionId, direction: "import" });
  }

  return { applied: summary, errors };
}

export async function runExport(
  supabase: DB,
  projectId: string,
  userId: string | null,
): Promise<{ xml: string; fileName: string; summary: Record<string, number> } | { error: string }> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, project_code, project_name")
    .eq("id", projectId)
    .maybeSingle();

  const config = await loadSyncConfig(supabase, projectId);
  const settings = toSettings(config);

  const { data: tasks } = await supabase
    .from("wbs_tasks")
    .select(
      "id, task_code, task_name, msp_uid, msp_outline_number, start_date, end_date, planned_hours, progress, dependency_task_ids, dependency_types, dependency_lag_days, schedule_level",
    )
    .eq("project_id", projectId)
    .eq("schedule_level", settings.syncLevel)
    .order("sort_order", { ascending: true })
    .order("task_code", { ascending: true });

  if (!tasks) return { error: "Failed to load tasks" };

  const idToTask = new Map<string, (typeof tasks)[number]>();
  for (const t of tasks) idToTask.set(t.id as string, t);

  const exportTasks: ExportTask[] = (tasks as Array<{
    id: string;
    task_code: string;
    task_name: string;
    msp_uid: string | null;
    msp_outline_number: string | null;
    start_date: string | null;
    end_date: string | null;
    planned_hours: number | null;
    progress: number | null;
    dependency_task_ids: string[] | null;
    dependency_types: string[] | null;
    dependency_lag_days: number[] | null;
  }>).map((t, i) => {
    return {
      uid: t.msp_uid ?? `EXPORT-${t.task_code}`,
      id: i + 1,
      name: t.task_name,
      outlineNumber: t.msp_outline_number ?? t.task_code,
      wbs: t.task_code,
      start: t.start_date,
      finish: t.end_date,
      durationHours: t.planned_hours,
      percentComplete: Math.round(t.progress ?? 0),
      summary: false,
      milestone: false,
      // Every link; MSPDI lag is in tenths of a minute (8 h working day).
      predecessors: (t.dependency_task_ids ?? []).flatMap((predId, k) => {
        const dep = idToTask.get(predId);
        if (!dep) return [];
        return [{
          uid: (dep.msp_uid as string | null) ?? `EXPORT-${dep.task_code}`,
          type: ((t.dependency_types?.[k] ?? "fs").toUpperCase()) as ExportTask["predecessors"][number]["type"],
          lag: Math.round(Number(t.dependency_lag_days?.[k] ?? 0) * 8 * 600),
        }];
      }),
    };
  });

  const xml = buildMspdXml({
    projectName: (project?.project_code as string | undefined) ?? null,
    projectTitle: (project?.project_name as string | undefined) ?? null,
    tasks: exportTasks,
  });

  const summary = { tasks: exportTasks.length };
  await supabase.from("wbs_sync_sessions").insert({
    project_id: projectId,
    direction: "export",
    status: "exported",
    summary,
    created_by: userId,
  });

  const code = (project?.project_code as string | undefined) ?? "project";
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return { xml, fileName: `${code}_MSP_export_${stamp}.xml`, summary };
}

async function markEvent(supabase: DB, id: string, status: string, error?: string) {
  const appliedAt = ["applied", "discarded"].includes(status) ? new Date().toISOString() : null;
  await supabase
    .from("wbs_sync_events")
    .update({ status, error: error ?? null, applied_at: appliedAt })
    .eq("id", id);
}

function uniqueCode(base: string, used: Set<string>): string {
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}
