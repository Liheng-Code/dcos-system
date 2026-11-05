// Pure rules: which WBS template tasks must point at a Construction Work Library activity (master_code).
// Agreed 2026-11-05: construction tasks (the Construction phase of the fixed sections and every floor block) link to an
// activity; Design, Procurement, T&C / Handover phases, milestones and non-work disciplines may stay free.
// A linked task gets wbs_tasks.activity_master_id when the template is applied, so Generate and the BOQ-driven
// programme reuse it instead of adding the same work again.

import type { TemplatePartId, TplNode, TplTask, WbsTemplateDoc } from "./wbs-template";
import { FLOOR_BLOCK_TYPES } from "./wbs-template";

/** Disciplines that are not physical work: free even inside the Construction phase. */
export const FREE_DISCIPLINES = ["Design", "Procurement", "Documentation", "Shop Drawings", "BIM", "QA/QC", "Handover", "Commissioning"] as const;
const FREE_SET = new Set<string>(FREE_DISCIPLINES.map((d) => d.toLowerCase()));

/** Top-level section nodes that are the Construction phase ("CONSTRUCTION", cost code C-…, not T&C / handover). */
export function constructionPhaseKeys(sectionNodes: readonly Pick<TplNode, "key" | "parent_key" | "wbs_name" | "cost_code">[]): Set<string> {
  return new Set(sectionNodes
    .filter((n) => !n.parent_key && (/construction/i.test(n.wbs_name) || /^C-/i.test(n.cost_code ?? "")) && !/commission|handover/i.test(n.wbs_name))
    .map((n) => n.key));
}

/** True when the task may stay without an activity. */
export function isFreeTaskAllowed(task: Pick<TplTask, "node_key" | "discipline" | "is_milestone">, part: TemplatePartId, constructionKeys: ReadonlySet<string>): boolean {
  if (task.is_milestone) return true;
  if (FREE_SET.has((task.discipline ?? "").trim().toLowerCase())) return true;
  if (part !== "sections") return false; // every floor block is construction work
  return !constructionKeys.has(task.node_key.split(".")[0]);
}

export type TaskLinkStatus = "linked" | "missing" | "free" | "free_linked" | "unknown_activity";

/** Link state of one task; `knownCodes` = activity codes that exist (any status but superseded / archived). */
export function taskLinkStatus(
  task: Pick<TplTask, "node_key" | "discipline" | "is_milestone" | "master_code">, part: TemplatePartId,
  constructionKeys: ReadonlySet<string>, knownCodes?: ReadonlySet<string>,
): TaskLinkStatus {
  const free = isFreeTaskAllowed(task, part, constructionKeys);
  if (task.master_code) {
    if (knownCodes && !knownCodes.has(task.master_code)) return "unknown_activity";
    return free ? "free_linked" : "linked";
  }
  return free ? "free" : "missing";
}

export interface TemplateCoverage {
  /** Construction tasks that must link, and how many do. */
  mustLink: number; linked: number;
  /** Tasks allowed to stay free (linked or not). */
  free: number;
  /** Construction tasks without an activity: part and task key, for the warning list. */
  missing: { part: TemplatePartId; key: string; name: string }[];
  /** Tasks whose master_code is not a known activity. */
  unknown: { part: TemplatePartId; key: string; name: string; code: string }[];
}

export function templateCoverage(doc: WbsTemplateDoc, knownCodes?: ReadonlySet<string>): TemplateCoverage {
  const keys = constructionPhaseKeys(doc.sections.nodes);
  const out: TemplateCoverage = { mustLink: 0, linked: 0, free: 0, missing: [], unknown: [] };
  const parts: [TemplatePartId, TplTask[]][] = [["sections", doc.sections.tasks]];
  for (const t of FLOOR_BLOCK_TYPES) if (doc.floor_blocks[t]) parts.push([t, doc.floor_blocks[t]!.tasks]);
  for (const [part, tasks] of parts) {
    for (const task of tasks) {
      const s = taskLinkStatus(task, part, keys, knownCodes);
      if (s === "free" || s === "free_linked") { out.free++; continue; }
      out.mustLink++;
      if (s === "linked") out.linked++;
      else if (s === "missing") out.missing.push({ part, key: task.key, name: task.task_name });
      else out.unknown.push({ part, key: task.key, name: task.task_name, code: task.master_code ?? "" });
    }
  }
  return out;
}

/** Whole percent of construction tasks linked; 100 when nothing has to link. */
export function coveragePercent(c: Pick<TemplateCoverage, "mustLink" | "linked">): number {
  return c.mustLink ? Math.round((c.linked / c.mustLink) * 100) : 100;
}
