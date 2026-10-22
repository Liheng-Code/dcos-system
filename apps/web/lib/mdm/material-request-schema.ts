import { z } from "zod";

/** Versioned MAT v1 payload accepted by the DWL material adapter. */
export const MdmMaterialCreatePayloadSchema = z.object({
  category_id: z.uuid(),
  description: z.string().trim().min(1).max(2000),
  unit: z.string().trim().min(1).max(80),
  material_name: z.string().trim().min(1).max(500).nullable().optional(),
  spec_reference: z.string().max(500).nullable().optional(),
  subcategory: z.string().max(200).nullable().optional(),
  discipline: z.string().max(100).nullable().optional(),
  material_type: z.string().max(200).nullable().optional(),
  tech_spec_summary: z.string().max(4000).nullable().optional(),
  standard: z.string().max(200).nullable().optional(),
  grade: z.string().max(200).nullable().optional(),
  brand: z.string().max(200).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  manufacturer: z.string().max(200).nullable().optional(),
  package_size: z.string().max(200).nullable().optional(),
  dimension: z.string().max(200).nullable().optional(),
  thickness: z.string().max(200).nullable().optional(),
  weight: z.string().max(200).nullable().optional(),
  color_finish: z.string().max(200).nullable().optional(),
  application_element: z.string().max(500).nullable().optional(),
  lifecycle_status: z.enum(["draft", "active", "superseded", "archived", "obsolete"]).optional(),
  tags: z.array(z.string().max(80)).max(64).optional(),
  legacy_code: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  budget_code_id: z.uuid().nullable().optional(),
  application_scope: z.string().max(2000).nullable().optional(),
  density: z.string().max(200).nullable().optional(),
  compressive_strength: z.string().max(200).nullable().optional(),
  effective_date: z.iso.date().nullable().optional(),
}).strict();

export function validateMdmMaterialCreate(entityCode: string, requestType: string, payload: unknown) {
  if (entityCode !== "MAT" || requestType !== "create") return null;
  const parsed = MdmMaterialCreatePayloadSchema.safeParse(payload);
  return parsed.success ? null : parsed.error.flatten();
}
