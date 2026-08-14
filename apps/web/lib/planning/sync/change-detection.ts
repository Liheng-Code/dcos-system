// Change detection: diff an incoming MSP schedule against the project's
// existing wbs_tasks and produce a DiffPlan (create / update / unchanged /
// orphan / skip). Pure — no I/O.

import type { DiffOp, DiffPlan, MspSchedule, MspTask, SyncSettings } from "./types";
import { computeSyncHash, suggestedTaskCode, taskToRow } from "./mapping";

export interface ExistingTask {
  id: string;
  task_code: string;
  task_name: string;
  msp_uid: string | null;
  sync_hash: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  planned_hours: number | null;
  progress: number | null;
  msp_outline_number: string | null;
}

export function detectChanges(params: {
  schedule: MspSchedule;
  existing: ExistingTask[];
  settings: SyncSettings;
  defaultWbsNodeId: string | null;
}): DiffPlan {
  const { schedule, existing, settings, defaultWbsNodeId } = params;
  const ops: DiffOp[] = [];
  const warnings: string[] = [];

  const inScopeUids = new Set(schedule.level3Tasks.map((t) => t.uid));
  const existingByUid = new Map<string, ExistingTask>();
  for (const task of existing) {
    if (task.msp_uid) existingByUid.set(task.msp_uid, task);
  }

  const hashOpts = { syncProgress: settings.syncProgress };

  for (const msp of schedule.level3Tasks) {
    // MSP marks level-3 tasks "summary" when they have level-4 sub-tasks.
    // Since only the sync level is imported, a level-3 summary is a real work
    // package here — import it as a normal task using MSP's rolled-up dates.
    const deps = resolveDependencies(msp.predecessors, inScopeUids, warnings, msp);
    const existingTask = existingByUid.get(msp.uid);

    if (!existingTask) {
      const row = buildCreateRow(msp, settings, defaultWbsNodeId);
      ops.push({
        action: "create",
        mspUid: msp.uid,
        outlineNumber: msp.outlineNumber,
        taskName: msp.name,
        row,
        incomingHash: computeSyncHash(msp, hashOpts),
        dependsOnMspUid: deps.primaryUid,
        dependsOnType: deps.primaryType,
        warning: deps.outOfScope?.length ? deps.outOfScope.join("; ") : undefined,
      });
      continue;
    }

    const incomingHash = computeSyncHash(msp, hashOpts);
    if (existingTask.sync_hash === incomingHash) {
      ops.push({
        action: "unchanged",
        mspUid: msp.uid,
        outlineNumber: msp.outlineNumber,
        taskName: msp.name,
        taskId: existingTask.id,
        taskCode: existingTask.task_code,
      });
      continue;
    }

    const changes = diffFields(msp, existingTask, settings);
    ops.push({
      action: "update",
      mspUid: msp.uid,
      outlineNumber: msp.outlineNumber,
      taskName: msp.name,
      taskId: existingTask.id,
      taskCode: existingTask.task_code,
      changes,
      incomingHash,
      dependsOnMspUid: deps.primaryUid,
      dependsOnType: deps.primaryType,
      warning: deps.outOfScope?.length ? deps.outOfScope.join("; ") : undefined,
    });
  }

  // Orphans: DCOS tasks linked to MSP but absent from the incoming file.
  const seen = new Set(schedule.level3Tasks.map((t) => t.uid));
  const allByOutline = new Map<string, MspTask>();
  for (const t of schedule.allTasks) {
    if (t.outlineNumber && !allByOutline.has(t.outlineNumber)) {
      allByOutline.set(t.outlineNumber, t);
    }
  }
  const allByName = new Map<string, MspTask>();
  for (const t of schedule.allTasks) {
    const key = t.name.trim().toLowerCase();
    if (key && !allByName.has(key)) allByName.set(key, t);
  }
  for (const task of existing) {
    if (task.msp_uid && !seen.has(task.msp_uid)) {
      ops.push({
        action: "orphan",
        mspUid: task.msp_uid,
        outlineNumber: task.msp_outline_number ?? undefined,
        taskName: task.task_name,
        taskId: task.id,
        taskCode: task.task_code,
        warning: orphanReason(task, schedule, allByOutline, allByName),
      });
    }
  }

  return { summary: summarize(ops), ops, warnings };
}

function summarize(ops: DiffOp[]): DiffPlan["summary"] {
  const s = { create: 0, update: 0, unchanged: 0, orphan: 0, skip: 0, total: ops.length };
  for (const op of ops) s[op.action]++;
  return s;
}

function orphanReason(
  task: ExistingTask,
  schedule: MspSchedule,
  allByOutline: Map<string, MspTask>,
  allByName: Map<string, MspTask>,
): string {
  const outline = task.msp_outline_number;
  const byOutline = outline ? allByOutline.get(outline) : undefined;
  if (byOutline && byOutline.uid !== task.msp_uid) {
    return byOutline.outlineLevel === 3
      ? `Present at outline ${outline} but with a different MSP UID (old ${task.msp_uid}, new ${byOutline.uid})`
      : `Outline ${outline} now sits at level ${byOutline.outlineLevel} (out of scope for the sync level)`;
  }

  const byName = task.task_name ? allByName.get(task.task_name.trim().toLowerCase()) : undefined;
  if (byName && byName.uid !== task.msp_uid) {
    return `A task with this name exists in the file but with a different MSP UID (old ${task.msp_uid}, new ${byName.uid})`;
  }

  return "Not present in the incoming MSP file";
}

function resolveDependencies(
  predecessors: MspTask["predecessors"],
  inScopeUids: Set<string>,
  warnings: string[],
  task: MspTask,
) {
  let primaryUid: string | undefined;
  let primaryType: DiffOp["dependsOnType"];
  const outOfScope: string[] = [];
  for (const p of predecessors) {
    if (inScopeUids.has(p.uid)) {
      if (!primaryUid) {
        primaryUid = p.uid;
        primaryType = p.type;
      }
    } else {
      outOfScope.push(`pred ${p.uid} (${p.type}) out of scope`);
    }
  }
  if (outOfScope.length) {
    warnings.push(`Task ${task.outlineNumber} ${task.name}: ${outOfScope.join(", ")}`);
  }
  return { primaryUid, primaryType, outOfScope };
}

function buildCreateRow(
  msp: MspTask,
  settings: SyncSettings,
  defaultWbsNodeId: string | null,
): Record<string, unknown> {
  return {
    ...taskToRow(msp, { syncProgress: settings.syncProgress }),
    task_code: suggestedTaskCode(msp),
    wbs_node_id: defaultWbsNodeId,
    schedule_level: settings.syncLevel,
    sort_order: msp.id,
  };
}

function diffFields(
  msp: MspTask,
  existing: ExistingTask,
  settings: SyncSettings,
): DiffOp["changes"] {
  const changes: NonNullable<DiffOp["changes"]> = [];
  const incoming = taskToRow(msp, { syncProgress: settings.syncProgress });

  const candidates: Array<[string, unknown, unknown]> = [
    ["task_name", incoming.task_name ?? "", existing.task_name ?? ""],
    ["start_date", incoming.start_date ?? "", existing.start_date ?? ""],
    ["end_date", incoming.end_date ?? "", existing.end_date ?? ""],
    ["description", incoming.description ?? "", existing.description ?? ""],
    ["planned_hours", incoming.planned_hours ?? "", existing.planned_hours ?? ""],
    [
      "msp_outline_number",
      incoming.msp_outline_number ?? "",
      existing.msp_outline_number ?? "",
    ],
  ];
  if (settings.syncProgress) {
    candidates.push(["progress", incoming.progress ?? 0, existing.progress ?? 0]);
  }

  for (const [field, to, from] of candidates) {
    if (String(to) !== String(from)) {
      changes.push({
        field,
        from: (from as string | number | null) || null,
        to: (to as string | number | null) || null,
      });
    }
  }
  return changes;
}
