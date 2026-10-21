// Data access for WBS Templates (wbs_templates.content) and for applying one to a project.
// Rules: lib/project/wbs/wbs-template.ts and supabase/migrations/20261003000004_wbs_templates.sql.

import { createClient } from "@/lib/supabase/client";
import { parseWbsTemplateDoc, type ExpandedTemplate, type SrcNode, type SrcTask, type WbsTemplateDoc } from "@/lib/project/wbs/wbs-template";

const db = () => createClient();

export interface WbsTemplate {
  id: string;
  template_name: string;
  template_desc: string | null;
  /** Sector slug (projects.category). */
  template_category: string | null;
  /** Building-type slugs (projects.building_type) this template is made for; empty = any in its sector. */
  building_types: string[];
  is_active: boolean;
  version: number;
  source: "project" | "excel" | "manual" | null;
  default_level_template_id: string | null;
  /** Generation kit (Activity Library) Generate suggests for projects built from this template */
  kit_code: string | null;
  updated_at: string;
  doc: WbsTemplateDoc;
}

const COLUMNS = "id, template_name, template_desc, template_category, building_types, is_active, version, source, default_level_template_id, kit_code, updated_at, content";

// @table wbs_templates
export async function listWbsTemplates(opts: { activeOnly?: boolean } = {}): Promise<WbsTemplate[]> {
  let q = db().from("wbs_templates").select(COLUMNS).order("template_name");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const { content, ...rest } = r as Record<string, unknown>;
    const header = rest as Omit<WbsTemplate, "doc">;
    return { ...header, building_types: header.building_types ?? [], doc: parseWbsTemplateDoc(content) };
  });
}

/** Creates (no id) or replaces a template; each save bumps its version. Returns the id. */
export async function saveWbsTemplate(t: {
  id?: string | null;
  template_name: string;
  template_desc?: string | null;
  template_category?: string | null;
  /** Omitted = keep the stored list. */
  building_types?: string[];
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

/** Sets the generation kit a template suggests (kept out of the versioned content, like the sector tags). */
// @table wbs_templates
export async function setWbsTemplateKit(id: string, kitCode: string | null) {
  const { error } = await db().from("wbs_templates").update({ kit_code: kitCode }).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface KitOption { code: string; name: string }

/** Generation kit codes (Activity Library › Kits), newest version's name per code. */
// @table plan_act_kits
export async function listKitOptions(): Promise<KitOption[]> {
  const { data, error } = await db().from("plan_act_kits").select("code, name, version").neq("status", "archived").order("code").order("version", { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  return ((data ?? []) as (KitOption & { version: number })[])
    .filter((k) => (seen.has(k.code) ? false : (seen.add(k.code), true)))
    .map(({ code, name }) => ({ code, name }));
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
    readAll<SrcTask & { master?: { code: string } | { code: string }[] | null }>(
      "wbs_tasks",
      "id, wbs_node_id, task_code, task_name, task_type, activity_type, is_milestone, discipline, cost_code, duration_days, description, schedule_level, sort_order, dependency_task_ids, dependency_types, dependency_lag_days, master:activity_master_id(code)",
      projectId,
    ),
  ]);
  return {
    nodes,
    tasks: tasks.map(({ master, ...t }) => ({ ...t, master_code: (Array.isArray(master) ? master[0] : master)?.code ?? null })),
  };
}

export interface ApplyResult {
  nodes_created: number;
  nodes_skipped: number;
  tasks_created: number;
  tasks_skipped: number;
  deps_linked: number;
  deps_unresolved: number;
  levels_updated: number;
  /** Activities that got their activity master from the template. */
  masters_linked?: number;
  /** Ids of activities linked to a master by this apply (to attach their default steps). */
  linked_task_ids?: string[];
}

export interface MasterOption { code: string; name: string; default_unit: string | null }

/** Active activity masters (newest version per code), for linking template activities. */
// @table plan_act_masters
export async function listActivityMasterOptions(): Promise<MasterOption[]> {
  const { data, error } = await db().from("plan_act_masters").select("code, name, default_unit, status, version")
    .in("status", ["active", "approved"]).order("code").order("version", { ascending: false });
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  return ((data ?? []) as (MasterOption & { status: string; version: number })[])
    .filter((m) => (seen.has(m.code) ? false : (seen.add(m.code), true)))
    .map(({ code, name, default_unit }) => ({ code, name, default_unit }));
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
  return (await getProjectTemplateContext(projectId)).wbsTemplateId;
}

/** The project's chosen template plus its sector / building type, for recommending templates. */
// @table projects
export async function getProjectTemplateContext(projectId: string): Promise<{ wbsTemplateId: string | null; sector: string | null; buildingType: string | null }> {
  const { data } = await db().from("projects").select("wbs_template_id, category, building_type").eq("id", projectId).maybeSingle();
  return {
    wbsTemplateId: (data?.wbs_template_id as string | null | undefined) ?? null,
    sector: (data?.category as string | null | undefined) ?? null,
    buildingType: (data?.building_type as string | null | undefined) ?? null,
  };
}

// @table projects
export async function setProjectWbsTemplateId(projectId: string, templateId: string | null) {
  const { error } = await db().from("projects").update({ wbs_template_id: templateId }).eq("id", projectId);
  if (error) throw new Error(error.message);
}
