import { z } from "zod"

// ── GRN Schemas ───────────────────────────────────────────────────────────────

export const GrnLineCreateSchema = z.object({
  item_id: z.string().uuid(),
  po_item_id: z.string().uuid().nullable().optional(),
  quantity_ordered: z.number().positive(),
  quantity_received: z.number().min(0),
  unit_cost: z.string().regex(/^\d+(\.\d{1,2})?$/, "unit_cost must be a decimal string"),
  batch_number: z.string().max(100).nullable().optional(),
  test_certificate_ref: z.string().max(200).nullable().optional(),
  inspection_required: z.boolean().default(false),
  condition_notes: z.string().max(500).nullable().optional(),
})

export const GrnCreateSchema = z.object({
  project_id: z.string().uuid(),
  store_id: z.string().uuid(),
  po_id: z.string().uuid(),
  po_number: z.string().min(1).max(50),
  supplier_id: z.string().uuid().nullable().optional(),
  supplier_delivery_note: z.string().max(100).nullable().optional(),
  vehicle_plate: z.string().max(20).nullable().optional(),
  driver_name: z.string().max(100).nullable().optional(),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "received_date must be YYYY-MM-DD"),
  received_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  remarks: z.string().max(500).nullable().optional(),
  lines: z.array(GrnLineCreateSchema).min(1, "At least one line item is required"),
})

export const GrnConfirmSchema = z.object({
  // No body required — confirmation is an action on the GRN itself
}).optional()

// ── Material Requisition Schemas ───────────────────────────────────────────────

export const MrLineCreateSchema = z.object({
  item_id: z.string().uuid(),
  quantity_requested: z.number().positive(),
  remarks: z.string().max(300).nullable().optional(),
})

export const MrCreateSchema = z.object({
  project_id: z.string().uuid(),
  store_id: z.string().uuid(),
  wbs_node_id: z.string().uuid(),
  task_id: z.string().uuid().nullable().optional(),
  cost_code: z.string().min(1).max(50),
  required_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "required_date must be YYYY-MM-DD"),
  remarks: z.string().max(500).nullable().optional(),
  lines: z.array(MrLineCreateSchema).min(1),
})

export const MrSubmitSchema = z.object({}).optional()

export const MrApproveSchema = z.object({
  lines: z.array(z.object({
    mr_line_id: z.string().uuid(),
    quantity_approved: z.number().min(0),
  })).optional(),
})

export const MrRejectSchema = z.object({
  rejection_reason: z.string().min(1, "rejection_reason is required").max(500),
})

export const MrIssueSchema = z.object({
  lines: z.array(z.object({
    mr_line_id: z.string().uuid(),
    quantity_issued: z.number().min(0),
  })).min(1),
})

// ── Transfer Schemas ───────────────────────────────────────────────────────────

export const TransferLineCreateSchema = z.object({
  item_id: z.string().uuid(),
  quantity_requested: z.number().positive(),
})

export const TransferCreateSchema = z.object({
  transfer_type: z.enum(["intra_project", "inter_project"]),
  source_project_id: z.string().uuid(),
  source_store_id: z.string().uuid(),
  destination_project_id: z.string().uuid(),
  destination_store_id: z.string().uuid(),
  transfer_reason: z.string().min(1).max(500),
  lines: z.array(TransferLineCreateSchema).min(1),
})

export const TransferApproveSchema = z.object({}).optional()

export const TransferDispatchSchema = z.object({
  lines: z.array(z.object({
    transfer_line_id: z.string().uuid(),
    quantity_dispatched: z.number().min(0),
  })).min(1),
})

export const TransferReceiveSchema = z.object({
  lines: z.array(z.object({
    transfer_line_id: z.string().uuid(),
    quantity_received: z.number().min(0),
  })).min(1),
})

export const TransferRejectSchema = z.object({
  rejection_reason: z.string().min(1).max(500),
})

// ── Adjustment Schemas ──────────────────────────────────────────────────────────

export const AdjustmentLineCreateSchema = z.object({
  item_id: z.string().uuid(),
  quantity_before: z.number().min(0),
  quantity_adjusted: z.number(),
  quantity_after: z.number().min(0),
  unit_cost: z.number().min(0).nullable().optional(),
})

export const AdjustmentCreateSchema = z.object({
  project_id: z.string().uuid(),
  store_id: z.string().uuid(),
  reason_code: z.enum([
    "damage", "expiry", "counting_error", "theft_loss",
    "correction", "stocktake_reconciliation", "write_off",
  ]),
  reason_description: z.string().min(1).max(500),
  lines: z.array(AdjustmentLineCreateSchema).min(1),
})

export const AdjustmentApproveSchema = z.object({}).optional()

export const AdjustmentRejectSchema = z.object({
  rejection_reason: z.string().min(1).max(500),
})

// ── Stocktake Schemas ───────────────────────────────────────────────────────────

export const StocktakeCreateSchema = z.object({
  project_id: z.string().uuid(),
  store_id: z.string().uuid(),
  notes: z.string().max(500).nullable().optional(),
})

export const StocktakeLineUpdateSchema = z.object({
  line_id: z.string().uuid(),
  counted_quantity: z.number().min(0),
  explanation: z.string().max(500).nullable().optional(),
})

export const StocktakeSubmitSchema = z.object({}).optional()

export const StocktakeCompleteSchema = z.object({}).optional()

export const StocktakeCancelSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
})

// ── Item Master Schemas ──────────────────────────────────────────────────────��──

export const ItemCreateSchema = z.object({
  item_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.enum(["structural", "civil", "mep", "finishes", "consumables", "others"]),
  sub_category: z.string().max(100).nullable().optional(),
  unit_of_measure: z.string().min(1).max(20),
  default_cost_code: z.string().max(50).nullable().optional(),
  min_stock_level: z.number().min(0).nullable().optional(),
  max_stock_level: z.number().min(0).nullable().optional(),
  reorder_quantity: z.number().min(0).nullable().optional(),
  lead_time_days: z.number().int().min(0).nullable().optional(),
  is_inspection_required: z.boolean().default(false),
  barcode: z.string().max(100).nullable().optional(),
  is_dg: z.boolean().default(false),
  is_batch_managed: z.boolean().default(false),
  shelf_life_days: z.number().int().min(0).nullable().optional(),
})

export const ItemUpdateSchema = z.object({
  item_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  category: z.enum(["structural", "civil", "mep", "finishes", "consumables", "others"]).optional(),
  sub_category: z.string().max(100).nullable().optional(),
  unit_of_measure: z.string().min(1).max(20).optional(),
  default_cost_code: z.string().max(50).nullable().optional(),
  min_stock_level: z.number().min(0).nullable().optional(),
  max_stock_level: z.number().min(0).nullable().optional(),
  reorder_quantity: z.number().min(0).nullable().optional(),
  lead_time_days: z.number().int().min(0).nullable().optional(),
  is_inspection_required: z.boolean().optional(),
  barcode: z.string().max(100).nullable().optional(),
  is_dg: z.boolean().optional(),
  is_batch_managed: z.boolean().optional(),
  shelf_life_days: z.number().int().min(0).nullable().optional(),
  is_active: z.boolean().optional(),
})

// ── Store Schemas ─────────────────────────────────────────────────────────────

export const StoreCreateSchema = z.object({
  project_id: z.string().uuid(),
  store_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  store_type: z.enum(["central", "site", "temporary", "yard", "dg"]),
  location_description: z.string().max(500).nullable().optional(),
  responsible_user_id: z.string().uuid().nullable().optional(),
  capacity_qty: z.number().min(0).nullable().optional(),
  capacity_uom: z.string().max(20).nullable().optional(),
})

export const StoreUpdateSchema = z.object({
  store_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  store_type: z.enum(["central", "site", "temporary", "yard", "dg"]).optional(),
  location_description: z.string().max(500).nullable().optional(),
  responsible_user_id: z.string().uuid().nullable().optional(),
  capacity_qty: z.number().min(0).nullable().optional(),
  capacity_uom: z.string().max(20).nullable().optional(),
  status: z.enum(["active", "closed"]).optional(),
})

// ── Location Schemas ─────────────────────────────────────────────────────────��─

export const LocationCreateSchema = z.object({
  store_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  code: z.string().min(1).max(50),
  location_type: z.enum(["zone", "aisle", "rack", "bin"]),
  is_dg_allowed: z.boolean().default(false),
  capacity_qty: z.number().min(0).nullable().optional(),
})

export const LocationUpdateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  location_type: z.enum(["zone", "aisle", "rack", "bin"]).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  is_dg_allowed: z.boolean().optional(),
  capacity_qty: z.number().min(0).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
})

// ── Return Schemas ───────────────────────────────────────────────────────────────

const decimalMoneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, "must be a decimal string")

export const ReturnLineCreateSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().positive(),
  condition: z.enum(["good", "damaged", "scrap"]),
  unit_cost: decimalMoneyString.nullable().optional(),
  remarks: z.string().max(500).nullable().optional(),
})

export const ReturnCreateSchema = z.object({
  project_id: z.string().uuid(),
  store_id: z.string().uuid(),
  mr_id: z.string().uuid().nullable().optional(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "return_date must be YYYY-MM-DD"),
  lines: z.array(ReturnLineCreateSchema).min(1, "At least one line item is required"),
})

export const ReturnInspectSchema = z.object({
  lines: z.array(z.object({
    return_line_id: z.string().uuid(),
    condition: z.enum(["good", "damaged", "scrap"]),
    unit_cost: decimalMoneyString.nullable().optional(),
    remarks: z.string().max(500).nullable().optional(),
  })).min(1),
})

export const ReturnPostSchema = z.object({}).optional()

// ── Tool Schemas ─────────────────────────────────────────────────────────────────

export const ToolCreateSchema = z.object({
  tool_code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  serial_no: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  purchase_value: decimalMoneyString.nullable().optional(),
  is_restricted: z.boolean().default(false),
})

export const ToolUpdateSchema = z.object({
  tool_code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  serial_no: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  purchase_value: decimalMoneyString.nullable().optional(),
  is_restricted: z.boolean().optional(),
  status: z.enum(["available", "issued", "maintenance", "lost", "disposed"]).optional(),
})

// Note: tool_id is intentionally NOT part of this schema — the route is nested under
// /tools/[id]/issue, so the tool id comes from the path (single source of truth),
// matching the existing convention for nested action routes (e.g. MrIssueSchema does
// not repeat mr_id, TransferDispatchSchema does not repeat transfer_id).
export const ToolIssueSchema = z.object({
  custodian_id: z.string().uuid(),
  project_id: z.string().uuid(),
  wbs_node_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "due_date must be YYYY-MM-DD"),
  condition_out: z.string().max(200).nullable().optional(),
  condition_out_photo_ids: z.array(z.string().uuid()).nullable().optional(),
})

export const ToolReturnSchema = z.object({
  condition_in: z.enum(["good", "damaged", "lost"]),
  condition_in_photo_ids: z.array(z.string().uuid()).nullable().optional(),
})

// ── Shared Types ───────────────────────────────────────────────────────────────

export type GrnCreate = z.infer<typeof GrnCreateSchema>
export type MrCreate = z.infer<typeof MrCreateSchema>
export type MrApprove = z.infer<typeof MrApproveSchema>
export type MrReject = z.infer<typeof MrRejectSchema>
export type MrIssue = z.infer<typeof MrIssueSchema>

export type AdjustmentCreate = z.infer<typeof AdjustmentCreateSchema>
export type AdjustmentReject = z.infer<typeof AdjustmentRejectSchema>

export type StocktakeCreate = z.infer<typeof StocktakeCreateSchema>

export type TransferCreate = z.infer<typeof TransferCreateSchema>
export type TransferDispatch = z.infer<typeof TransferDispatchSchema>
export type TransferReceive = z.infer<typeof TransferReceiveSchema>
export type TransferReject = z.infer<typeof TransferRejectSchema>

export type ItemCreate = z.infer<typeof ItemCreateSchema>
export type ItemUpdate = z.infer<typeof ItemUpdateSchema>

export type StoreCreate = z.infer<typeof StoreCreateSchema>
export type StoreUpdate = z.infer<typeof StoreUpdateSchema>

export type LocationCreate = z.infer<typeof LocationCreateSchema>
export type LocationUpdate = z.infer<typeof LocationUpdateSchema>

export type ReturnCreate = z.infer<typeof ReturnCreateSchema>
export type ReturnInspect = z.infer<typeof ReturnInspectSchema>

export type ToolCreate = z.infer<typeof ToolCreateSchema>
export type ToolUpdate = z.infer<typeof ToolUpdateSchema>
export type ToolIssue = z.infer<typeof ToolIssueSchema>
export type ToolReturn = z.infer<typeof ToolReturnSchema>
