// Maps normalized MSP tasks onto wbs_tasks columns and computes the canonical
// sync hash used for change detection.

import type { MspTask } from "./types";

// Duration formats seen in MSPDI: "PT40H", "PT5D", "P1W", "P1M2D", ...
const DURATION_RE = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/;
const WORK_RE = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/;

export function isoDurationToHours(duration?: string): number | null {
  if (!duration) return null;
  const m = duration.match(DURATION_RE);
  if (!m) return null;
  const days = parseInt(m[1] || "0", 10);
  const hours = parseInt(m[2] || "0", 10);
  const minutes = parseInt(m[3] || "0", 10);
  const seconds = parseInt(m[4] || "0", 10);
  const total = days * 8 + hours + minutes / 60 + seconds / 3600;
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

export function isoWorkToHours(work?: string): number | null {
  if (!work) return null;
  const m = work.match(WORK_RE);
  if (!m) return null;
  const days = parseInt(m[1] || "0", 10);
  const hours = parseInt(m[2] || "0", 10);
  const minutes = parseInt(m[3] || "0", 10);
  const total = days * 8 + hours + minutes / 60;
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

// The synced field values that will be written to wbs_tasks. Execution fields
// (status, priority, owner, progress, costs, delay) are intentionally absent.
export function taskToRow(task: MspTask, opts: { syncProgress: boolean }): Record<string, unknown> {
  const row: Record<string, unknown> = {
    task_name: task.name || null,
    start_date: task.start || null,
    end_date: task.finish || null,
    description: task.notes || null,
    planned_hours: isoWorkToHours(task.work),
    msp_uid: task.uid || null,
    msp_outline_number: task.outlineNumber || null,
    sync_source: "ms_project",
  };
  if (opts.syncProgress) {
    row.progress = task.percentComplete;
  }
  return row;
}

// Canonical hash over the synced fields; stable ordering so identical MSP
// payloads always produce the same hash.
export function computeSyncHash(task: MspTask, opts: { syncProgress: boolean }): string {
  const canonical = {
    name: task.name || "",
    start: task.start || "",
    finish: task.finish || "",
    notes: task.notes || "",
    plannedHours: isoWorkToHours(task.work),
    progress: opts.syncProgress ? task.percentComplete : null,
    outlineNumber: task.outlineNumber || "",
    predecessors: task.predecessors
      .map((p) => `${p.uid}:${p.type}`)
      .sort()
      .join("|"),
  };
  return JSON.stringify(canonical);
}

// Deterministic, human-readable task_code derived from the MSP outline number,
// e.g. "1.2.3" -> "MSP-1.2.3". Uniquified against the project at commit time.
export function suggestedTaskCode(task: MspTask): string {
  const base = task.outlineNumber || task.uid || String(task.id);
  return `MSP-${base}`;
}
