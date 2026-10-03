// Data access for WBS Templates (wbs_templates.content) and for applying one to a project.
// Rules: lib/project/wbs/wbs-template.ts and supabase/migrations/20261003000004_wbs_templates.sql.

import { createClient } from "@/lib/supabase/client";
import { parseWbsTemplateDoc, type ExpandedTemplate, type SrcNode, type SrcTask, type WbsTemplateDoc } from "@/lib/project/wbs/wbs-template";

const db = () => createClient();

export interface WbsTemplate {
  id: string;
  template_name: string;
  template_desc: string | null;
  template_category: string | null;
  is_active: boolean;
  version: number;
  source: "project" | "excel" | "manual" | null;
  default_level_template_id: string | null;
  updated_at: string;
  doc: WbsTemplateDoc;
}

const COLUMNS = "id, template_name, template_desc, template_category, is_active, version, source, default_level_template_id, updated_at, content";

// @table wbs_templates
export async function listWbsTemplates(opts: { activeOnly?: boolean } = {}): Promise<WbsTemplate[]> {
  let q = db().from("wbs_templates").select(COLUMNS).order("template_name");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const { content, ...rest } = r as Record<string, unknown>;
    return { ...(rest as Omit<WbsTemplate, "doc">), doc: parseWbsTemplateDoc(content) };
  });
}

/** Creates (no id) or replaces a template; each save bumps its version. Returns the id. */
export async function saveWbsTemplate(t: {
  id?: string | null;
  template_name: string;
  template_desc?: string | null;
  template_category?: string | null;
  is_active?: boolean;
  source?: WbsTemplate["source"];
  default_level_template_id?: string | null;
  doc: WbsTemplateDoc;
}): Promise<string> {
  const { doc, ...header } = t;
  const { data, error } = await db().rpc("save_wbs_template", { p: { ...header, content: doc } });
  if (error) throw new Error(error.message);
  return data as string;
}

// @table wbs_templates
export async function deleteWbsTemplate(id: string) {
  const { error } = await db().from("wbs_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const PAGE = 1000;

async function readAll<T>(table: "wbs_nodes" | "wbs_tasks", columns: string, projectId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from(table).select(columns).eq("project_id", projectId)
      .order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** A project's WBS nodes and activities, as input for "Save as template". */
export async function loadProjectWbsSource(projectId: string): Promise<{ nodes: SrcNode[]; tasks: SrcTask[] }> {
  const [nodes, tasks] = await Promise.all([
    readAll<SrcNode & { level_type?: string | null }>(
      "wbs_nodes",
      "id, parent_id, node_type, wbs_code, wbs_name, discipline, cost_code, is_external_works, schedule_level, sort_order, level_type, floor_height_m",
      projectId,
    ),
    readAll<SrcTask>(
      "wbs_tasks",
      "id, wbs_node_id, task_code, task_name, task_type, activity_type, is_milestone, discipline, cost_code, duration_days, description, schedule_level, sort_order, dependency_task_ids, dependency_types, dependency_lag_days",
      projectId,
    ),
  ]);
  return { nodes, tasks };
}

export interface ApplyResult {
  nodes_created: number;
  nodes_skipped: number;
  tasks_created: number;
  tasks_skipped: number;
  deps_linked: number;
  deps_unresolved: number;
  levels_updated: number;
}

/** Copies an expanded template into the project (merge: anything already there is skipped). */
export async function applyWbsTemplate(projectId: string, templateId: string | null, expanded: ExpandedTemplate): Promise<ApplyResult> {
  const { data, error } = await db().rpc("apply_wbs_template", {
    p_project_id: projectId,
    p_template_id: templateId,
    p_payload: expanded.payload,
    p_levels: expanded.levels,
  });
  if (error) throw new Error(error.message);
  return data as ApplyResult;
}

// @table projects
export async function getProjectWbsTemplateId(projectId: string): Promise<string | null> {
  const { data } = await db().from("projects").select("wbs_template_id").eq("id", projectId).maybeSingle();
  return (data?.wbs_template_id as string | null | undefined) ?? null;
}

// @table projects
export async function setProjectWbsTemplateId(projectId: string, templateId: string | null) {
  const { error } = await db().from("projects").update({ wbs_template_id: templateId }).eq("id", projectId);
  if (error) throw new Error(error.message);
}
