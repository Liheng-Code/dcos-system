// Data access for the Level Library (templates) and for copying a level list into a building.
// Rules: lib/level-library.ts and supabase/migrations/20261003000003_level_library.sql.

import { createClient } from "@/lib/supabase/client";
import type { LevelItem, LevelTemplate, LevelType } from "@/lib/level-library";

const db = () => createClient();

interface TemplateRow {
  id: string;
  template_name: string;
  description: string | null;
  building_type: string | null;
  is_active: boolean;
  version: number;
  level_template_items: {
    sort_order: number;
    level_code: string;
    level_name: string;
    level_type: LevelType;
    floor_height_m: number | null;
    typical_gfa_m2: number | null;
    source_level_id: string | null;
  }[];
}

function toTemplate(row: TemplateRow): LevelTemplate {
  return {
    id: row.id,
    template_name: row.template_name,
    description: row.description,
    building_type: row.building_type,
    is_active: row.is_active,
    version: row.version,
    items: [...(row.level_template_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        level_code: i.level_code,
        level_name: i.level_name,
        level_type: i.level_type,
        floor_height_m: i.floor_height_m != null ? Number(i.floor_height_m) : null,
        typical_gfa_m2: i.typical_gfa_m2 != null ? Number(i.typical_gfa_m2) : null,
        source_level_id: i.source_level_id,
      })),
  };
}

// @table level_naming_templates
export async function listLevelTemplates(opts: { activeOnly?: boolean } = {}): Promise<LevelTemplate[]> {
  let q = db()
    .from("level_naming_templates")
    .select("id, template_name, description, building_type, is_active, version, level_template_items(sort_order, level_code, level_name, level_type, floor_height_m, typical_gfa_m2, source_level_id)")
    .order("template_name");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as TemplateRow[]).map(toTemplate);
}

/** Creates (no id) or replaces a template's header and items in one transaction; bumps its version. */
export async function saveLevelTemplate(t: {
  id?: string | null;
  template_name: string;
  description?: string | null;
  building_type?: string | null;
  is_active?: boolean;
  items: LevelItem[];
}): Promise<string> {
  const { data, error } = await db().rpc("save_level_template", {
    p: {
      ...t,
      items: t.items.map((i) => ({
        level_code: i.level_code,
        level_name: i.level_name,
        level_type: i.level_type,
        floor_height_m: i.floor_height_m,
        typical_gfa_m2: i.typical_gfa_m2,
        source_level_id: i.source_level_id ?? null,
      })),
    },
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// @table level_naming_templates
export async function setLevelTemplateActive(id: string, isActive: boolean) {
  const { error } = await db().from("level_naming_templates").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
}

// @table level_naming_templates
export async function deleteLevelTemplate(id: string) {
  const { error } = await db().from("level_naming_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Codes of the levels already under a building. */
// @table wbs_nodes
export async function listBuildingLevelCodes(buildingId: string): Promise<string[]> {
  const { data, error } = await db().from("wbs_nodes").select("wbs_code").eq("parent_id", buildingId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.wbs_code as string);
}

/**
 * Copies a (user-edited) level list under a building. The template is only recorded as the
 * source; it is never changed. Codes already under the building are skipped.
 */
export async function applyLevelsToBuilding(buildingId: string, templateId: string | null, items: LevelItem[]) {
  const { data, error } = await db().rpc("apply_level_template", {
    p_building_id: buildingId,
    p_template_id: templateId,
    p_items: items.map((i) => ({
      level_code: i.level_code,
      level_name: i.level_name,
      level_type: i.level_type,
      floor_height_m: i.floor_height_m,
      typical_gfa_m2: i.typical_gfa_m2,
    })),
  });
  if (error) throw new Error(error.message);
  return data as { created: string[]; skipped: string[] };
}

/** Name of the template a level was copied from (reference only). */
// @table level_naming_templates
export async function getLevelTemplateName(id: string): Promise<string | null> {
  const { data } = await db().from("level_naming_templates").select("template_name").eq("id", id).maybeSingle();
  return (data?.template_name as string | undefined) ?? null;
}
