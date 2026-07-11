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
