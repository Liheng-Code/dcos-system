import { createClient } from "@/lib/supabase/client";
import { parseWbsTemplateDoc } from "@/lib/project/wbs/wbs-template";

export type QsPlanningTemplateLinkKind = "template" | "scope_node" | "location";
export type QsPlanningTemplateLinkStatus = "suggested" | "approved" | "excluded";

export interface QsPlanningTemplateLink {
  id: string;
  qs_template_id: string;
  planning_template_id: string;
  qs_template_version: number;
  planning_template_version: number;
  mapping_kind: QsPlanningTemplateLinkKind;
  qs_template_item_id: string | null;
  planning_node_key: string | null;
  status: QsPlanningTemplateLinkStatus;
  note: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface SaveQsPlanningTemplateLink {
  id?: string;
  qs_template_id: string;
  planning_template_id: string;
  mapping_kind: QsPlanningTemplateLinkKind;
  qs_template_item_id?: string | null;
  planning_node_key?: string | null;
  status?: QsPlanningTemplateLinkStatus;
  note?: string | null;
  is_active?: boolean;
}

function templateNodeKeys(content: unknown): Set<string> {
  const doc = parseWbsTemplateDoc(content);
  const keys = new Set(doc.sections.nodes.map((node) => `sections:${node.key}`));
  for (const [block, part] of Object.entries(doc.floor_blocks)) {
    for (const node of part?.nodes ?? []) keys.add(`floor_blocks.${block}:${node.key}`);
  }
  return keys;
}

/** Read the current crosswalk for a QS template, including stale version snapshots. */
export async function listQsPlanningTemplateLinks(qsTemplateId: string): Promise<QsPlanningTemplateLink[]> {
  const { data, error } = await createClient().from("qs_wbs_template_planning_links")
    .select("*").eq("qs_template_id", qsTemplateId).eq("is_active", true).order("mapping_kind").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as QsPlanningTemplateLink[];
}

/** Save a link against current library versions and reject missing/obsolete node keys. */
export async function saveQsPlanningTemplateLink(input: SaveQsPlanningTemplateLink): Promise<string> {
  const db = createClient();
  const [{ data: qsTemplate, error: qsError }, { data: planningTemplate, error: planningError }] = await Promise.all([
    db.from("qs_wbs_templates").select("id, version").eq("id", input.qs_template_id).maybeSingle(),
    db.from("wbs_templates").select("id, version, content").eq("id", input.planning_template_id).maybeSingle(),
  ]);
  if (qsError) throw new Error(qsError.message);
  if (planningError) throw new Error(planningError.message);
  if (!qsTemplate) throw new Error("QS template was not found.");
  if (!planningTemplate) throw new Error("Planning WBS template was not found.");

  const qsItemId = input.qs_template_item_id ?? null;
  const planningNodeKey = input.planning_node_key?.trim() || null;
  if (input.mapping_kind === "template" && (qsItemId || planningNodeKey)) {
    throw new Error("Template-level links cannot include a QS item or Planning node key.");
  }
  if (input.mapping_kind === "scope_node" && (!qsItemId || !planningNodeKey)) {
    throw new Error("Scope-node links require both a QS item and a Planning node key.");
  }
  if (input.mapping_kind === "location" && (qsItemId || !planningNodeKey)) {
    throw new Error("Location links require a Planning node key and no QS item.");
  }
  if (qsItemId) {
    const { data: qsItem, error } = await db.from("qs_wbs_template_items").select("id")
      .eq("id", qsItemId).eq("template_id", input.qs_template_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!qsItem) throw new Error("The selected QS item does not belong to this template.");
  }
  if (planningNodeKey && !templateNodeKeys(planningTemplate.content).has(planningNodeKey)) {
    throw new Error(`Planning node key '${planningNodeKey}' does not exist in the current template version.`);
  }

  const row = {
    qs_template_id: input.qs_template_id,
    planning_template_id: input.planning_template_id,
    qs_template_version: qsTemplate.version,
    planning_template_version: planningTemplate.version,
    mapping_kind: input.mapping_kind,
    qs_template_item_id: qsItemId,
    planning_node_key: planningNodeKey,
    status: input.status ?? "suggested",
    note: input.note?.trim() || null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? db.from("qs_wbs_template_planning_links").update(row).eq("id", input.id).select("id").single()
    : db.from("qs_wbs_template_planning_links").insert(row).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deactivateQsPlanningTemplateLink(id: string): Promise<void> {
  const { error } = await createClient().from("qs_wbs_template_planning_links")
    .update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

