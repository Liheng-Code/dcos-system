import { createAdminClient } from "@/lib/supabase/server";
import type { BimModel, BimViewpoint, BimElementWbsMap, BimElementTakeoff } from "./bim-types";

export class BimError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = "BimError";
  }
}

export async function resolveTenantId(supabase: ReturnType<typeof createAdminClient>, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();
  if (data?.company_id) return data.company_id;

  const { data: fallback, error: fbErr } = await supabase
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (fbErr || !fallback?.id) throw new BimError("No company found in the system", "TENANT_NOT_FOUND", 403);

  await supabase.from("profiles").update({ company_id: fallback.id }).eq("id", userId);
  return fallback.id;
}

export async function listModels(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  projectId: string,
): Promise<BimModel[]> {
  const { data, error } = await supabase
    .from("bim_models")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new BimError(`Failed to list models: ${error.message}`, "LIST_FAILED", 500);
  return data ?? [];
}

export async function getModel(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
): Promise<BimModel> {
  const { data, error } = await supabase
    .from("bim_models")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", modelId)
    .single();
  if (error || !data) throw new BimError("Model not found", "NOT_FOUND", 404);
  return data;
}

export async function computeNextRevision(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  projectId: string,
  modelName: string,
): Promise<string> {
  const { data } = await supabase
    .from("bim_models")
    .select("revision")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("model_name", modelName)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return "R0";
  const last = data[0].revision;
  const num = parseInt(last.replace("R", ""), 10);
  return `R${(isNaN(num) ? 0 : num) + 1}`;
}

export async function createModelRecord(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  projectId: string,
  modelName: string,
  discipline: string,
  ifcSchema: string,
  fileUrl: string,
  fileSizeMb: number,
  uploadedBy: string,
): Promise<BimModel> {
  const revision = await computeNextRevision(supabase, tenantId, projectId, modelName);

  const { data, error } = await supabase
    .from("bim_models")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      model_name: modelName,
      discipline,
      revision,
      ifc_schema: ifcSchema,
      file_url: fileUrl,
      file_size_mb: fileSizeMb,
      status: "CURRENT",
      uploaded_by: uploadedBy,
    })
    .select()
    .single();
  if (error) throw new BimError(`Failed to create model: ${error.message}`, "CREATE_FAILED", 500);
  return data;
}

export async function supersedePreviousRevisions(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  projectId: string,
  modelName: string,
  excludeModelId: string,
): Promise<void> {
  await supabase
    .from("bim_models")
    .update({ status: "SUPERSEDED" })
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("model_name", modelName)
    .neq("id", excludeModelId)
    .eq("status", "CURRENT");
}

export async function updateElementCount(
  supabase: ReturnType<typeof createAdminClient>,
  modelId: string,
  count: number,
): Promise<void> {
  await supabase
    .from("bim_models")
    .update({ element_count: count })
    .eq("id", modelId);
}

export async function supersedeModel(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
): Promise<BimModel> {
  const { data, error } = await supabase
    .from("bim_models")
    .update({ status: "SUPERSEDED" })
    .eq("tenant_id", tenantId)
    .eq("id", modelId)
    .select()
    .single();
  if (error || !data) throw new BimError("Failed to supersede model", "SUPERSEDE_FAILED", 500);
  return data;
}

export async function updateModel(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
  updates: { model_name?: string; discipline?: string; ifc_schema?: string; status?: string },
): Promise<BimModel> {
  const { data, error } = await supabase
    .from("bim_models")
    .update(updates)
    .eq("tenant_id", tenantId)
    .eq("id", modelId)
    .select()
    .single();
  if (error || !data) throw new BimError("Failed to update model", "UPDATE_FAILED", 500);
  return data;
}

export async function deleteModel(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
): Promise<void> {
  const { data: model, error: fetchErr } = await supabase
    .from("bim_models")
    .select("id, file_url")
    .eq("tenant_id", tenantId)
    .eq("id", modelId)
    .single();
  if (fetchErr || !model) throw new BimError("Model not found", "NOT_FOUND", 404);

  // Delete viewpoints and WBS mappings first
  await supabase.from("bim_viewpoints").delete().eq("model_id", modelId);
  await supabase.from("bim_element_wbs_map").delete().eq("model_id", modelId);

  // Delete storage file if URL points to our bucket
  if (model.file_url?.includes("bim-models")) {
    const pathMatch = model.file_url.match(/bim-models\/(.+)/);
    if (pathMatch) {
      await supabase.storage.from("bim-models").remove([decodeURIComponent(pathMatch[1])]);
    }
  }

  // Delete the model record
  const { error } = await supabase
    .from("bim_models")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", modelId);
  if (error) throw new BimError("Failed to delete model", "DELETE_FAILED", 500);
}

export async function listRevisions(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  projectId: string,
  modelName: string,
): Promise<BimModel[]> {
  const { data, error } = await supabase
    .from("bim_models")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .eq("model_name", modelName)
    .order("created_at", { ascending: false });
  if (error) throw new BimError("Failed to list revisions", "LIST_FAILED", 500);
  return data ?? [];
}

// ─── Viewpoints ──────────────────────────────────────────────────────────────

export async function createViewpoint(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
  name: string,
  cameraState: object,
  visibilityState: object,
  createdBy: string,
): Promise<BimViewpoint> {
  const { data, error } = await supabase
    .from("bim_viewpoints")
    .insert({
      tenant_id: tenantId,
      model_id: modelId,
      name,
      camera_state: cameraState,
      visibility_state: visibilityState,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw new BimError("Failed to create viewpoint", "CREATE_FAILED", 500);
  return data;
}

export async function listViewpoints(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
): Promise<BimViewpoint[]> {
  const { data, error } = await supabase
    .from("bim_viewpoints")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("model_id", modelId)
    .order("created_at", { ascending: false });
  if (error) throw new BimError("Failed to list viewpoints", "LIST_FAILED", 500);
  return data ?? [];
}

// ─── WBS Map ─────────────────────────────────────────────────────────────────

export async function bulkMapElementsToWbs(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
  mappings: { global_id: string; wbs_node_id: string }[],
  mappedBy: string,
): Promise<number> {
  const rows = mappings.map((m) => ({
    tenant_id: tenantId,
    model_id: modelId,
    global_id: m.global_id,
    wbs_node_id: m.wbs_node_id,
    mapped_by: mappedBy,
  }));
  const { data, error } = await supabase
    .from("bim_element_wbs_map")
    .upsert(rows, { onConflict: "model_id,global_id" })
    .select();
  if (error) throw new BimError("Failed to map elements", "MAP_FAILED", 500);
  return data?.length ?? 0;
}

export async function listWbsMap(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
): Promise<BimElementWbsMap[]> {
  const { data, error } = await supabase
    .from("bim_element_wbs_map")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("model_id", modelId);
  if (error) throw new BimError("Failed to list WBS map", "LIST_FAILED", 500);
  return data ?? [];
}

// ─── Element Takeoff ─────────────────────────────────────────────────────────

export async function bulkUpsertElementTakeoff(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
  rows: Omit<BimElementTakeoff, "id" | "tenant_id" | "model_id" | "extracted_by" | "extracted_at">[],
  extractedBy: string,
): Promise<number> {
  const records = rows.map((row) => ({
    ...row,
    tenant_id: tenantId,
    model_id: modelId,
    extracted_by: extractedBy,
  }));
  const { data, error } = await supabase
    .from("bim_element_takeoff")
    .upsert(records, { onConflict: "model_id,global_id" })
    .select();
  if (error) throw new BimError(`Failed to extract takeoff data: ${error.message}`, "TAKEOFF_UPSERT_FAILED", 500);
  return data?.length ?? 0;
}

export async function listElementTakeoff(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  modelId: string,
): Promise<BimElementTakeoff[]> {
  const { data, error } = await supabase
    .from("bim_element_takeoff")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("model_id", modelId);
  if (error) throw new BimError("Failed to list takeoff data", "LIST_FAILED", 500);
  return data ?? [];
}
