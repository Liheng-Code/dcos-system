import { SupabaseClient } from "@supabase/supabase-js"
import type { GrnCreate, MrCreate, MrApprove, MrReject, MrIssue, TransferCreate, TransferDispatch, TransferReceive, AdjustmentCreate, StocktakeCreate } from "./inv-schemas"

// ── Error codes (BR-mapped) ────────────────────────────────────────────────────

export class InvError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "InvError"
  }
}

// ── Audit helper ──────────────────────────────────────────────────────────────
// Fire-and-forget: audit failures never block the main operation.

async function logInvAudit(
  supabase: SupabaseClient,
  params: {
    tenantId: string
    tableName: string
    recordId: string
    action: string
    performedBy: string
    oldStatus?: string
    newStatus?: string
    details?: Record<string, unknown>
  },
): Promise<void> {
  try {
    await supabase.from("inv_audit_log").insert({
      tenant_id:    params.tenantId,
      table_name:   params.tableName,
      record_id:    params.recordId,
      action:       params.action,
      performed_by: params.performedBy,
      old_status:   params.oldStatus ?? null,
      new_status:   params.newStatus ?? null,
      details:      params.details ?? null,
    })
  } catch {
    // Audit must not block the main operation
  }
}

// ── Sequence helpers ───────────────────────────────────────────────────────────

async function nextSequence(
  supabase: SupabaseClient,
  table: string,
  column: string,
  projectId: string,
  prefix: string,
): Promise<string> {
  const { count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
  const seq = String((count ?? 0) + 1).padStart(4, "0")
  return `${prefix}-${seq}`
}

// ── Tenant resolver ────────────────────────────────────────────────────────────
// Reads company_id from profiles — this is the canonical tenant_id.
// Migration 20260623000001 adds the column and the JWT hook that embeds it
// as auth.jwt() ->> 'tenant_id' so RLS policies evaluate correctly.
// No fallback: a user without a company assignment must not access tenant data.

export async function resolveTenantId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single()

  if (error || !data?.company_id) {
    throw new InvError("INV_NO_TENANT", "User has no tenant assignment", 403)
  }
  return data.company_id as string
}

// ── GRN Service ────────────────────────────────────────────────────────────────

/** BR-F3-01: Every GRN must reference a valid, approved PO owned by the same tenant. */
async function validatePo(
  supabase: SupabaseClient,
  poId: string,
  tenantId: string,
): Promise<{ po_number: string; supplier_id: string | null }> {
  const { data: po, error } = await supabase
    .from("procurement_pos")
    .select("id, po_number, status, supplier_id")
    .eq("id", poId)
    .eq("tenant_id", tenantId)
    .single()

  if (error || !po) throw new InvError("INV_PO_NOT_FOUND", "Purchase Order not found", 404)
  if (!["approved", "issued", "partially_delivered"].includes(po.status)) {
    throw new InvError("INV_PO_NOT_APPROVED", `PO ${po.po_number} is not in an approved state (status: ${po.status})`, 400)
  }
  return { po_number: po.po_number, supplier_id: po.supplier_id }
}

/** BR-F3-03: Received quantity cannot exceed outstanding PO balance. */
async function validateGrnQuantities(
  supabase: SupabaseClient,
  poId: string,
  tenantId: string,
  lines: GrnCreate["lines"],
): Promise<void> {
  const poItemIds = lines.map(l => l.po_item_id).filter(Boolean) as string[]
  if (poItemIds.length === 0) return

  const { data: poItems } = await supabase
    .from("procurement_po_items")
    .select("id, quantity_ordered, quantity_delivered")
    .eq("po_id", poId)
    .eq("tenant_id", tenantId)
    .in("id", poItemIds)

  for (const line of lines) {
    if (!line.po_item_id) continue
    const poItem = poItems?.find(p => p.id === line.po_item_id)
    if (!poItem) throw new InvError("INV_PO_ITEM_NOT_FOUND", `PO line ${line.po_item_id} not found`, 404)

    const outstanding = poItem.quantity_ordered - (poItem.quantity_delivered ?? 0)
    if (line.quantity_received > outstanding) {
      throw new InvError(
        "INV_OVER_PO_QUANTITY",
        `Received quantity (${line.quantity_received}) exceeds outstanding PO balance (${outstanding}) for PO line ${line.po_item_id}`,
        400,
        { po_item_id: line.po_item_id, outstanding, requested: line.quantity_received },
      )
    }
  }
}

export async function createGrn(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  data: GrnCreate,
) {
  const { po_number, supplier_id } = await validatePo(supabase, data.po_id, tenantId)
  await validateGrnQuantities(supabase, data.po_id, tenantId, data.lines)

  const grnNumber = await nextSequence(supabase, "inv_grns", "grn_number", data.project_id, "GRN")

  const { data: grn, error: grnErr } = await supabase
    .from("inv_grns")
    .insert({
      tenant_id: tenantId,
      project_id: data.project_id,
      store_id: data.store_id,
      grn_number: grnNumber,
      po_id: data.po_id,
      po_number: po_number,
      supplier_id: data.supplier_id ?? supplier_id,
      supplier_delivery_note: data.supplier_delivery_note,
      vehicle_plate: data.vehicle_plate,
      driver_name: data.driver_name,
      received_date: data.received_date,
      received_time: data.received_time,
      received_by: userId,
      status: "draft",
      remarks: data.remarks,
      created_by: userId,
    })
    .select()
    .single()

  if (grnErr || !grn) throw new InvError("INV_CREATE_FAILED", grnErr?.message ?? "Failed to create GRN", 500)

  const lineRecords = data.lines.map(l => ({
    tenant_id: tenantId,
    grn_id: grn.id,
    item_id: l.item_id,
    po_item_id: l.po_item_id ?? null,
    quantity_ordered: l.quantity_ordered,
    quantity_received: l.quantity_received,
    unit_cost: parseFloat(l.unit_cost),
    total_cost: l.quantity_received * parseFloat(l.unit_cost),
    batch_number: l.batch_number ?? null,
    test_certificate_ref: l.test_certificate_ref ?? null,
    inspection_required: l.inspection_required,
    inspection_status: l.inspection_required ? "pending" : "not_required",
    condition_notes: l.condition_notes ?? null,
  }))

  const { error: lineErr } = await supabase.from("inv_grn_lines").insert(lineRecords)
  if (lineErr) throw new InvError("INV_LINE_CREATE_FAILED", lineErr.message, 500)

  await logInvAudit(supabase, {
    tenantId:  tenantId,
    tableName: "inv_grns",
    recordId:  grn.id,
    action:    "grn_created",
    performedBy: userId,
    newStatus: "draft",
    details:   { grn_number: grn.grn_number, po_id: data.po_id, store_id: data.store_id },
  })

  return grn
}

/**
 * Confirm GRN: updates stock balances and posts movement records.
 * BR-F3-04: Available or Under Inspection status per line.
 * BR-F3-07: GRN is immutable once confirmed.
 * BR-F3-08: Cost commitment posted to cost control (movement ledger).
 */
export async function confirmGrn(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  grnId: string,
) {
  // Fetch GRN with lines
  const { data: grn, error: grnErr } = await supabase
    .from("inv_grns")
    .select("*, inv_grn_lines(*)")
    .eq("id", grnId)
    .single()

  if (grnErr || !grn) throw new InvError("INV_GRN_NOT_FOUND", "GRN not found", 404)
  if (grn.tenant_id !== tenantId) throw new InvError("INV_NOT_FOUND", "GRN not found", 404)

  // BR-F3-07: immutable once confirmed
  if (grn.status === "confirmed") {
    throw new InvError("INV_INVALID_TRANSITION", "GRN is already confirmed", 400)
  }
  if (grn.status === "cancelled") {
    throw new InvError("INV_INVALID_TRANSITION", "Cannot confirm a cancelled GRN", 400)
  }

  const lines: Array<{
    id: string
    item_id: string
    quantity_received: number
    unit_cost: number
    total_cost: number
    inspection_required: boolean
  }> = grn.inv_grn_lines

  if (!lines.length) throw new InvError("INV_NO_LINES", "GRN has no line items", 400)

  // For each line: update/upsert inv_stock and insert movement record
  for (const line of lines) {
    if (line.quantity_received === 0) continue

    const stockStatus = line.inspection_required ? "quantity_under_inspection" : "quantity_available"

    // Upsert stock balance (BR-F3-04)
    const { data: existing } = await supabase
      .from("inv_stock")
      .select("id, quantity_available, quantity_under_inspection, unit_cost_fifo")
      .eq("store_id", grn.store_id)
      .eq("item_id", line.item_id)
      .maybeSingle()

    if (existing) {
      const update: Record<string, unknown> = {
        last_movement_at: new Date().toISOString(),
      }
      update[stockStatus] = (existing[stockStatus as keyof typeof existing] as number ?? 0) + line.quantity_received
      // Simple FIFO: update unit cost (would be weighted average in production)
      update.unit_cost_fifo = line.unit_cost

      await supabase.from("inv_stock").update(update).eq("id", existing.id)
    } else {
      const insert: Record<string, unknown> = {
        tenant_id: tenantId,
        store_id: grn.store_id,
        item_id: line.item_id,
        project_id: grn.project_id,
        quantity_available: 0,
        quantity_reserved: 0,
        quantity_under_inspection: 0,
        quantity_quarantined: 0,
        unit_cost_fifo: line.unit_cost,
        last_movement_at: new Date().toISOString(),
      }
      insert[stockStatus] = line.quantity_received
      await supabase.from("inv_stock").insert(insert)
    }

    // Get balance after for ledger
    const { data: updatedStock } = await supabase
      .from("inv_stock")
      .select("quantity_available, quantity_under_inspection")
      .eq("store_id", grn.store_id)
      .eq("item_id", line.item_id)
      .single()

    const balanceAfter =
      (updatedStock?.quantity_available ?? 0) + (updatedStock?.quantity_under_inspection ?? 0)

    // Insert movement ledger entry (BR-F3-08)
    await supabase.from("inv_movements").insert({
      tenant_id: tenantId,
      project_id: grn.project_id,
      store_id: grn.store_id,
      item_id: line.item_id,
      movement_type: "grn_receipt",
      reference_type: "grn",
      reference_id: grn.id,
      reference_number: grn.grn_number,
      quantity: line.quantity_received,
      unit_cost: line.unit_cost,
      total_cost: line.total_cost,
      balance_after: balanceAfter,
      movement_date: grn.received_date,
      created_by: userId,
    })
  }

  // Mark GRN confirmed (BR-F3-07: now immutable)
  const { data: updated, error: updateErr } = await supabase
    .from("inv_grns")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: userId })
    .eq("id", grnId)
    .select()
    .single()

  if (updateErr) throw new InvError("INV_CONFIRM_FAILED", updateErr.message, 500)

  await logInvAudit(supabase, {
    tenantId:   tenantId,
    tableName:  "inv_grns",
    recordId:   grnId,
    action:     "grn_confirmed",
    performedBy: userId,
    oldStatus:  "draft",
    newStatus:  "confirmed",
    details:    { grn_number: grn.grn_number, line_count: lines.length },
  })

  return updated
}

// ── Material Requisition Service ───────────────────────────────────────────────

export async function createMr(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  data: MrCreate,
) {
  const mrNumber = await nextSequence(supabase, "inv_material_requisitions", "mr_number", data.project_id, "MR")

  const { data: mr, error: mrErr } = await supabase
    .from("inv_material_requisitions")
    .insert({
      tenant_id: tenantId,
      project_id: data.project_id,
      store_id: data.store_id,
      mr_number: mrNumber,
      wbs_node_id: data.wbs_node_id,
      task_id: data.task_id ?? null,
      cost_code: data.cost_code,
      required_date: data.required_date,
      requested_by: userId,
      status: "draft",
      remarks: data.remarks ?? null,
    })
    .select()
    .single()

  if (mrErr || !mr) throw new InvError("INV_MR_CREATE_FAILED", mrErr?.message ?? "Failed to create MR", 500)

  const lineRecords = data.lines.map(l => ({
    tenant_id: tenantId,
    mr_id: mr.id,
    item_id: l.item_id,
    quantity_requested: l.quantity_requested,
    quantity_issued: 0,
    remarks: l.remarks ?? null,
  }))

  const { error: lineErr } = await supabase.from("inv_mr_lines").insert(lineRecords)
  if (lineErr) throw new InvError("INV_MR_LINE_FAILED", lineErr.message, 500)

  await logInvAudit(supabase, {
    tenantId:   tenantId,
    tableName:  "inv_material_requisitions",
    recordId:   mr.id,
    action:     "mr_created",
    performedBy: userId,
    newStatus:  "draft",
    details:    { mr_number: mr.mr_number, wbs_node_id: data.wbs_node_id, cost_code: data.cost_code },
  })

  return mr
}

/** BR-F4-02: MR must be approved before Storekeeper processes the issue. */
export async function submitMr(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  mrId: string,
) {
  const { data: mr, error } = await supabase
    .from("inv_material_requisitions")
    .select("id, status, requested_by, tenant_id")
    .eq("id", mrId)
    .single()

  if (error || !mr) throw new InvError("INV_MR_NOT_FOUND", "MR not found", 404)
  if (mr.tenant_id !== tenantId) throw new InvError("INV_NOT_FOUND", "MR not found", 404)
  if (mr.status !== "draft") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot submit MR with status '${mr.status}'`, 400)
  }

  const { data: updated, error: updateErr } = await supabase
    .from("inv_material_requisitions")
    .update({ status: "submitted" })
    .eq("id", mrId)
    .select()
    .single()

  if (updateErr) throw new InvError("INV_SUBMIT_FAILED", updateErr.message, 500)

  await logInvAudit(supabase, {
    tenantId:   tenantId,
    tableName:  "inv_material_requisitions",
    recordId:   mrId,
    action:     "mr_submitted",
    performedBy: userId,
    oldStatus:  "draft",
    newStatus:  "submitted",
  })

  return updated
}

export async function approveMr(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  mrId: string,
  data: MrApprove,
) {
  const { data: mr, error } = await supabase
    .from("inv_material_requisitions")
    .select("id, status, tenant_id, inv_mr_lines(*)")
    .eq("id", mrId)
    .single()

  if (error || !mr) throw new InvError("INV_MR_NOT_FOUND", "MR not found", 404)
  if (mr.tenant_id !== tenantId) throw new InvError("INV_NOT_FOUND", "MR not found", 404)
  if (mr.status !== "submitted") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot approve MR with status '${mr.status}'`, 400)
  }

  // Apply approved quantities to lines if provided
  if (data.lines?.length) {
    for (const lineUpdate of data.lines) {
      await supabase
        .from("inv_mr_lines")
        .update({ quantity_approved: lineUpdate.quantity_approved })
        .eq("id", lineUpdate.mr_line_id)
        .eq("mr_id", mrId)
    }
  } else {
    // Default: approve requested quantity on all lines
    const lines = mr.inv_mr_lines as Array<{ id: string; quantity_requested: number }>
    for (const line of lines) {
      await supabase
        .from("inv_mr_lines")
        .update({ quantity_approved: line.quantity_requested })
        .eq("id", line.id)
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from("inv_material_requisitions")
    .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", mrId)
    .select()
    .single()

  if (updateErr) throw new InvError("INV_APPROVE_FAILED", updateErr.message, 500)

  await logInvAudit(supabase, {
    tenantId:   tenantId,
    tableName:  "inv_material_requisitions",
    recordId:   mrId,
    action:     "mr_approved",
    performedBy: userId,
    oldStatus:  "submitted",
    newStatus:  "approved",
    details:    { approved_lines: data.lines?.length ?? "all" },
  })

  return updated
}

export async function rejectMr(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  mrId: string,
  data: MrReject,
) {
  const { data: mr, error } = await supabase
    .from("inv_material_requisitions")
    .select("id, status, tenant_id")
    .eq("id", mrId)
    .single()

  if (error || !mr) throw new InvError("INV_MR_NOT_FOUND", "MR not found", 404)
  if (mr.tenant_id !== tenantId) throw new InvError("INV_NOT_FOUND", "MR not found", 404)
  if (mr.status !== "submitted") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot reject MR with status '${mr.status}'`, 400)
  }

  const { data: updated, error: updateErr } = await supabase
    .from("inv_material_requisitions")
    .update({ status: "rejected", rejection_reason: data.rejection_reason })
    .eq("id", mrId)
    .select()
    .single()

  if (updateErr) throw new InvError("INV_REJECT_FAILED", updateErr.message, 500)

  await logInvAudit(supabase, {
    tenantId:   tenantId,
    tableName:  "inv_material_requisitions",
    recordId:   mrId,
    action:     "mr_rejected",
    performedBy: userId,
    oldStatus:  "submitted",
    newStatus:  "rejected",
    details:    { rejection_reason: data.rejection_reason },
  })

  return updated
}

/**
 * Issue materials from store.
 * BR4: Stock can never go below zero.
 * BR-F4-04: Issue quantity ≤ approved MR quantity.
 * BR-F4-05: Cost transaction posted on issue confirmation.
 * BR-F4-06: Cannot issue from quarantined/under-inspection stock.
 */
export async function issueMr(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  mrId: string,
  data: MrIssue,
) {
  // Fetch MR with lines
  const { data: mr, error } = await supabase
    .from("inv_material_requisitions")
    .select("*, inv_mr_lines(*)")
    .eq("id", mrId)
    .single()

  if (error || !mr) throw new InvError("INV_MR_NOT_FOUND", "MR not found", 404)
  if (mr.tenant_id !== tenantId) throw new InvError("INV_NOT_FOUND", "MR not found", 404)
  if (!["approved", "partially_issued"].includes(mr.status)) {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot issue from MR with status '${mr.status}'`, 400)
  }

  // Check store is not locked by an active stock take
  const { data: activeSt } = await supabase
    .from("inv_stocktakes")
    .select("id, stocktake_number")
    .eq("store_id", mr.store_id)
    .in("status", ["open", "counting", "pending_approval"])
    .maybeSingle()

  if (activeSt) {
    throw new InvError(
      "INV_STORE_LOCKED",
      `Store is locked for stock take ${activeSt.stocktake_number}. Complete or cancel the stock take first.`,
      409,
    )
  }

  const mrLines = mr.inv_mr_lines as Array<{
    id: string
    item_id: string
    quantity_approved: number | null
    quantity_requested: number
    quantity_issued: number
  }>

  for (const issueItem of data.lines) {
    const mrLine = mrLines.find(l => l.id === issueItem.mr_line_id)
    if (!mrLine) throw new InvError("INV_LINE_NOT_FOUND", `MR line ${issueItem.mr_line_id} not found`, 404)

    const approvedQty = mrLine.quantity_approved ?? mrLine.quantity_requested
    const remainingApproved = approvedQty - mrLine.quantity_issued

    // BR-F4-04: issue quantity ≤ remaining approved
    if (issueItem.quantity_issued > remainingApproved) {
      throw new InvError(
        "INV_OVER_APPROVED_QUANTITY",
        `Issue quantity (${issueItem.quantity_issued}) exceeds remaining approved quantity (${remainingApproved})`,
        400,
        { mr_line_id: issueItem.mr_line_id, remaining_approved: remainingApproved },
      )
    }

    if (issueItem.quantity_issued === 0) continue

    // Fetch current stock
    const { data: stock } = await supabase
      .from("inv_stock")
      .select("id, quantity_available, unit_cost_fifo")
      .eq("store_id", mr.store_id)
      .eq("item_id", mrLine.item_id)
      .maybeSingle()

    // BR-F4-06: cannot issue from quarantined stock
    const { data: item } = await supabase
      .from("inv_items")
      .select("name")
      .eq("id", mrLine.item_id)
      .single()

    const available = stock?.quantity_available ?? 0

    // BR4: stock cannot go negative
    if (issueItem.quantity_issued > available) {
      throw new InvError(
        "INV_NEGATIVE_STOCK",
        `Issued quantity (${issueItem.quantity_issued}) exceeds available stock (${available}) for item ${item?.name ?? mrLine.item_id}`,
        400,
        { item_id: mrLine.item_id, available, requested: issueItem.quantity_issued },
      )
    }

    const unitCost = stock?.unit_cost_fifo ?? 0
    const newAvailable = available - issueItem.quantity_issued

    // Deduct stock
    await supabase
      .from("inv_stock")
      .update({
        quantity_available: newAvailable,
        last_movement_at: new Date().toISOString(),
      })
      .eq("id", stock!.id)

    // Post movement ledger entry (BR-F4-05)
    await supabase.from("inv_movements").insert({
      tenant_id: tenantId,
      project_id: mr.project_id,
      store_id: mr.store_id,
      item_id: mrLine.item_id,
      movement_type: "mr_issue",
      reference_type: "mr",
      reference_id: mr.id,
      reference_number: mr.mr_number,
      quantity: -issueItem.quantity_issued,
      unit_cost: unitCost,
      total_cost: -(issueItem.quantity_issued * unitCost),
      wbs_node_id: mr.wbs_node_id,
      cost_code: mr.cost_code,
      balance_after: newAvailable,
      movement_date: new Date().toISOString().split("T")[0],
      created_by: userId,
    })

    // Update MR line quantity_issued and unit_cost_at_issue
    await supabase
      .from("inv_mr_lines")
      .update({
        quantity_issued: mrLine.quantity_issued + issueItem.quantity_issued,
        unit_cost_at_issue: unitCost,
      })
      .eq("id", mrLine.id)

  }

  // Determine new MR status: fully issued or partially issued
  const { data: updatedLines } = await supabase
    .from("inv_mr_lines")
    .select("quantity_approved, quantity_requested, quantity_issued")
    .eq("mr_id", mrId)

  const allIssued = (updatedLines ?? []).every(l => {
    const approved = l.quantity_approved ?? l.quantity_requested
    return l.quantity_issued >= approved
  })

  const newStatus = allIssued ? "issued" : "partially_issued"

  const { data: updated, error: updateErr } = await supabase
    .from("inv_material_requisitions")
    .update({ status: newStatus })
    .eq("id", mrId)
    .select()
    .single()

  if (updateErr) throw new InvError("INV_ISSUE_FAILED", updateErr.message, 500)

  await logInvAudit(supabase, {
    tenantId:   tenantId,
    tableName:  "inv_material_requisitions",
    recordId:   mrId,
    action:     allIssued ? "mr_issued" : "mr_partially_issued",
    performedBy: userId,
    oldStatus:  mr.status,
    newStatus:  newStatus,
    details:    { line_count: data.lines.length, wbs_node_id: mr.wbs_node_id, cost_code: mr.cost_code },
  })

  return updated
}

// ── Stock balance ──────────────────────────────────────────────────────────────

export async function getStockByStore(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string,
  filters?: { category?: string; lowStockOnly?: boolean },
) {
  let query = supabase
    .from("inv_stock")
    .select(`
      *,
      inv_items!inner(item_code, name, category, unit_of_measure, reorder_quantity, min_stock_level)
    `)
    .eq("store_id", storeId)
    .eq("tenant_id", tenantId)

  if (filters?.category) {
    query = query.eq("inv_items.category", filters.category)
  }

  const { data, error } = await query
  if (error) throw new InvError("INV_STOCK_FETCH_FAILED", error.message, 500)

  if (filters?.lowStockOnly) {
    return (data ?? []).filter(row => {
      const item = row.inv_items as { reorder_quantity: number | null }
      return item?.reorder_quantity != null && row.quantity_available <= item.reorder_quantity
    })
  }

  return data ?? []
}

// ── Transfer Service ───────────────────────────────────────────────────────────

export async function createTransfer(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  data: TransferCreate,
) {
  const transferNumber = await nextSequence(
    supabase, "inv_transfers", "transfer_number",
    data.source_project_id, "TF",
  )

  const { data: transfer, error: tfErr } = await supabase
    .from("inv_transfers")
    .insert({
      tenant_id: tenantId,
      transfer_number: transferNumber,
      transfer_type: data.transfer_type,
      source_project_id: data.source_project_id,
      source_store_id: data.source_store_id,
      destination_project_id: data.destination_project_id,
      destination_store_id: data.destination_store_id,
      status: "pending",
      transfer_reason: data.transfer_reason,
      requested_by: userId,
    })
    .select()
    .single()

  if (tfErr || !transfer) {
    throw new InvError("INV_TF_CREATE_FAILED", tfErr?.message ?? "Failed to create transfer", 500)
  }

  const lineRecords = data.lines.map(l => ({
    tenant_id: tenantId,
    transfer_id: transfer.id,
    item_id: l.item_id,
    quantity_requested: l.quantity_requested,
  }))

  const { error: lineErr } = await supabase.from("inv_transfer_lines").insert(lineRecords)
  if (lineErr) throw new InvError("INV_TF_LINE_FAILED", lineErr.message, 500)

  await logInvAudit(supabase, {
    tenantId,
    tableName: "inv_transfers",
    recordId: transfer.id,
    action: "transfer_created",
    performedBy: userId,
    newStatus: "pending",
    details: { transfer_number: transferNumber },
  })

  return transfer
}

export async function approveTransferSource(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  transferId: string,
) {
  const { data: tf } = await supabase
    .from("inv_transfers")
    .select("id, status, tenant_id, source_approved_by")
    .eq("id", transferId)
    .single()

  if (!tf || tf.tenant_id !== tenantId) throw new InvError("INV_TF_NOT_FOUND", "Transfer not found", 404)
  if (tf.status !== "pending") throw new InvError("INV_INVALID_TRANSITION", `Cannot approve source with status '${tf.status}'`, 400)
  if (tf.source_approved_by) throw new InvError("INV_ALREADY_APPROVED", "Source already approved", 400)

  const { data: updated } = await supabase
    .from("inv_transfers")
    .update({ source_approved_by: userId, source_approved_at: new Date().toISOString() })
    .eq("id", transferId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_transfers", recordId: transferId,
    action: "transfer_source_approved", performedBy: userId,
    newStatus: "pending",
  })

  return updated
}

export async function approveTransferDestination(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  transferId: string,
) {
  const { data: tf } = await supabase
    .from("inv_transfers")
    .select("id, status, tenant_id, source_approved_by, dest_approved_by")
    .eq("id", transferId)
    .single()

  if (!tf || tf.tenant_id !== tenantId) throw new InvError("INV_TF_NOT_FOUND", "Transfer not found", 404)
  if (tf.status !== "pending") throw new InvError("INV_INVALID_TRANSITION", `Cannot approve destination with status '${tf.status}'`, 400)
  if (!tf.source_approved_by) throw new InvError("INV_SOURCE_NOT_APPROVED", "Source must be approved first", 400)
  if (tf.dest_approved_by) throw new InvError("INV_ALREADY_APPROVED", "Destination already approved", 400)

  const { data: updated } = await supabase
    .from("inv_transfers")
    .update({
      dest_approved_by: userId,
      dest_approved_at: new Date().toISOString(),
      status: "approved",
    })
    .eq("id", transferId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_transfers", recordId: transferId,
    action: "transfer_dest_approved", performedBy: userId,
    oldStatus: "pending", newStatus: "approved",
  })

  return updated
}

export async function dispatchTransfer(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  transferId: string,
  data: TransferDispatch,
) {
  const { data: tf } = await supabase
    .from("inv_transfers")
    .select("*, inv_transfer_lines(*)")
    .eq("id", transferId)
    .single()

  if (!tf || tf.tenant_id !== tenantId) throw new InvError("INV_TF_NOT_FOUND", "Transfer not found", 404)
  if (tf.status !== "approved") throw new InvError("INV_INVALID_TRANSITION", `Cannot dispatch with status '${tf.status}'`, 400)

  for (const dl of data.lines) {
    const line = (tf.inv_transfer_lines as Array<{ id: string; item_id: string; quantity_requested: number }>)
      .find(l => l.id === dl.transfer_line_id)
    if (!line) throw new InvError("INV_LINE_NOT_FOUND", `Line ${dl.transfer_line_id} not found`, 404)
    if (dl.quantity_dispatched > line.quantity_requested) {
      throw new InvError("INV_OVER_REQUESTED", `Dispatched qty exceeds requested for line ${dl.transfer_line_id}`, 400)
    }

    const { data: stock } = await supabase
      .from("inv_stock")
      .select("id, quantity_available, unit_cost_fifo")
      .eq("store_id", tf.source_store_id)
      .eq("item_id", line.item_id)
      .maybeSingle()

    const available = stock?.quantity_available ?? 0
    if (dl.quantity_dispatched > available) {
      throw new InvError("INV_NEGATIVE_STOCK", `Dispatched qty (${dl.quantity_dispatched}) exceeds available stock (${available})`, 400)
    }

    const unitCost = stock?.unit_cost_fifo ?? 0
    const newAvailable = available - dl.quantity_dispatched

    await supabase.from("inv_stock").update({ quantity_available: newAvailable, last_movement_at: new Date().toISOString() }).eq("id", stock!.id)

    await supabase.from("inv_transfer_lines").update({ quantity_dispatched: dl.quantity_dispatched, unit_cost: unitCost }).eq("id", dl.transfer_line_id)

    await supabase.from("inv_movements").insert({
      tenant_id: tenantId, project_id: tf.source_project_id, store_id: tf.source_store_id,
      item_id: line.item_id, movement_type: "transfer_out", reference_type: "transfer",
      reference_id: tf.id, reference_number: tf.transfer_number, quantity: -dl.quantity_dispatched,
      unit_cost: unitCost, total_cost: -(dl.quantity_dispatched * unitCost),
      balance_after: newAvailable, movement_date: new Date().toISOString().split("T")[0], created_by: userId,
    })
  }

  const { data: updated } = await supabase
    .from("inv_transfers")
    .update({ status: "in_transit", dispatched_by: userId, dispatched_at: new Date().toISOString() })
    .eq("id", transferId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_transfers", recordId: transferId,
    action: "transfer_dispatched", performedBy: userId,
    oldStatus: "approved", newStatus: "in_transit",
  })

  return updated
}

export async function receiveTransfer(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  transferId: string,
  data: TransferReceive,
) {
  const { data: tf } = await supabase
    .from("inv_transfers")
    .select("*, inv_transfer_lines(*)")
    .eq("id", transferId)
    .single()

  if (!tf || tf.tenant_id !== tenantId) throw new InvError("INV_TF_NOT_FOUND", "Transfer not found", 404)
  if (tf.status !== "in_transit") throw new InvError("INV_INVALID_TRANSITION", `Cannot receive with status '${tf.status}'`, 400)

  let hasDiscrepancy = false

  for (const rl of data.lines) {
    const line = (tf.inv_transfer_lines as Array<{
      id: string; item_id: string; quantity_requested: number; quantity_dispatched: number | null
    }>).find(l => l.id === rl.transfer_line_id)
    if (!line) throw new InvError("INV_LINE_NOT_FOUND", `Line ${rl.transfer_line_id} not found`, 404)

    const dispatched = line.quantity_dispatched ?? line.quantity_requested
    if (rl.quantity_received > dispatched) {
      throw new InvError("INV_OVER_DISPATCHED", `Received qty exceeds dispatched for line ${rl.transfer_line_id}`, 400)
    }
    if (rl.quantity_received < dispatched) hasDiscrepancy = true

    const unitCost = line.unit_cost ?? 0

    const { data: existing } = await supabase
      .from("inv_stock")
      .select("id, quantity_available, unit_cost_fifo")
      .eq("store_id", tf.destination_store_id)
      .eq("item_id", line.item_id)
      .maybeSingle()

    if (existing) {
      const newAvail = (existing.quantity_available ?? 0) + rl.quantity_received
      await supabase.from("inv_stock").update({ quantity_available: newAvail, unit_cost_fifo: unitCost, last_movement_at: new Date().toISOString() }).eq("id", existing.id)
    } else {
      await supabase.from("inv_stock").insert({
        tenant_id: tenantId, store_id: tf.destination_store_id, item_id: line.item_id,
        project_id: tf.destination_project_id, quantity_available: rl.quantity_received,
        quantity_reserved: 0, quantity_under_inspection: 0, quantity_quarantined: 0,
        unit_cost_fifo: unitCost, last_movement_at: new Date().toISOString(),
      })
    }

    await supabase.from("inv_transfer_lines").update({ quantity_received: rl.quantity_received }).eq("id", rl.transfer_line_id)

    await supabase.from("inv_movements").insert({
      tenant_id: tenantId, project_id: tf.destination_project_id, store_id: tf.destination_store_id,
      item_id: line.item_id, movement_type: "transfer_in", reference_type: "transfer",
      reference_id: tf.id, reference_number: tf.transfer_number, quantity: rl.quantity_received,
      unit_cost: unitCost, total_cost: rl.quantity_received * unitCost,
      balance_after: rl.quantity_received, movement_date: new Date().toISOString().split("T")[0], created_by: userId,
    })
  }

  const newStatus = hasDiscrepancy ? "discrepancy" : "received"

  const { data: updated } = await supabase
    .from("inv_transfers")
    .update({ status: newStatus, received_by: userId, received_at: new Date().toISOString() })
    .eq("id", transferId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_transfers", recordId: transferId,
    action: "transfer_received", performedBy: userId,
    oldStatus: "in_transit", newStatus,
  })

  return updated
}

export async function rejectTransfer(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  transferId: string,
  rejectionReason: string,
) {
  const { data: tf } = await supabase
    .from("inv_transfers")
    .select("id, status, tenant_id")
    .eq("id", transferId)
    .single()

  if (!tf || tf.tenant_id !== tenantId) throw new InvError("INV_TF_NOT_FOUND", "Transfer not found", 404)
  if (!["pending"].includes(tf.status)) {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot reject with status '${tf.status}'`, 400)
  }

  const { data: updated } = await supabase
    .from("inv_transfers")
    .update({ status: "rejected", transfer_reason: rejectionReason })
    .eq("id", transferId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_transfers", recordId: transferId,
    action: "transfer_rejected", performedBy: userId,
    oldStatus: "pending", newStatus: "rejected",
  })

  return updated
}

// ── Adjustment Service ──────────────────────────────────────────────────────────

export async function createAdjustment(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  data: AdjustmentCreate,
) {
  const adjustmentNumber = await nextSequence(
    supabase, "inv_adjustments", "adjustment_number",
    data.project_id, "ADJ",
  )

  const { data: adjustment, error: adjErr } = await supabase
    .from("inv_adjustments")
    .insert({
      tenant_id: tenantId,
      adjustment_number: adjustmentNumber,
      project_id: data.project_id,
      store_id: data.store_id,
      reason_code: data.reason_code,
      reason_description: data.reason_description,
      status: "pending_approval",
      requested_by: userId,
    })
    .select()
    .single()

  if (adjErr || !adjustment) {
    throw new InvError("INV_ADJ_CREATE_FAILED", adjErr?.message ?? "Failed to create adjustment", 500)
  }

  const lines = data.lines.map(l => ({
    tenant_id: tenantId,
    adjustment_id: adjustment.id,
    item_id: l.item_id,
    quantity_before: l.quantity_before,
    quantity_adjusted: l.quantity_adjusted,
    quantity_after: l.quantity_after,
    unit_cost: l.unit_cost ?? null,
    cost_impact: l.unit_cost ? +(l.quantity_adjusted * l.unit_cost).toFixed(2) : null,
  }))

  const { error: linesErr } = await supabase.from("inv_adjustment_lines").insert(lines)
  if (linesErr) {
    throw new InvError("INV_ADJ_LINES_FAILED", linesErr.message, 500)
  }

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_adjustments", recordId: adjustment.id,
    action: "adjustment_created", performedBy: userId,
    newStatus: "pending_approval",
  })

  return adjustment
}

export async function approveAdjustment(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  adjustmentId: string,
) {
  const { data: adj } = await supabase
    .from("inv_adjustments")
    .select("*, inv_adjustment_lines(*)")
    .eq("id", adjustmentId)
    .single()

  if (!adj || adj.tenant_id !== tenantId) throw new InvError("INV_ADJ_NOT_FOUND", "Adjustment not found", 404)
  if (adj.status !== "pending_approval") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot approve with status '${adj.status}'`, 400)
  }

  const lines = adj.inv_adjustment_lines as Array<{
    id: string; item_id: string; quantity_before: number;
    quantity_adjusted: number; quantity_after: number; unit_cost: number | null
  }>

  for (const line of lines) {
    const { data: stock } = await supabase
      .from("inv_stock")
      .select("id, quantity_available")
      .eq("store_id", adj.store_id)
      .eq("item_id", line.item_id)
      .maybeSingle()

    const newAvailable = (stock?.quantity_available ?? 0) + line.quantity_adjusted
    if (newAvailable < 0) {
      throw new InvError(
        "INV_NEGATIVE_STOCK",
        `Adjustment would cause negative stock for item ${line.item_id}`,
        400,
      )
    }

    if (stock) {
      await supabase.from("inv_stock").update({
        quantity_available: newAvailable,
        last_movement_at: new Date().toISOString(),
      }).eq("id", stock.id)
    } else {
      await supabase.from("inv_stock").insert({
        tenant_id: tenantId, store_id: adj.store_id, item_id: line.item_id,
        project_id: adj.project_id, quantity_available: newAvailable,
        quantity_reserved: 0, quantity_under_inspection: 0, quantity_quarantined: 0,
        unit_cost_fifo: line.unit_cost ?? 0, last_movement_at: new Date().toISOString(),
      })
    }

    const movementType = adj.reason_code === "write_off" ? "write_off"
      : adj.reason_code === "stocktake_reconciliation" ? "stocktake_adjustment"
      : "adjustment"

    await supabase.from("inv_movements").insert({
      tenant_id: tenantId, project_id: adj.project_id, store_id: adj.store_id,
      item_id: line.item_id, movement_type: movementType, reference_type: "adjustment",
      reference_id: adj.id, reference_number: adj.adjustment_number,
      quantity: line.quantity_adjusted,
      unit_cost: line.unit_cost ?? 0,
      total_cost: (line.unit_cost ?? 0) * line.quantity_adjusted,
      balance_after: newAvailable,
      movement_date: new Date().toISOString().split("T")[0],
      created_by: userId,
    })
  }

  const { data: updated } = await supabase
    .from("inv_adjustments")
    .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", adjustmentId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_adjustments", recordId: adjustmentId,
    action: "adjustment_approved", performedBy: userId,
    oldStatus: "pending_approval", newStatus: "approved",
  })

  return updated
}

export async function rejectAdjustment(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  adjustmentId: string,
  rejectionReason: string,
) {
  const { data: adj } = await supabase
    .from("inv_adjustments")
    .select("id, status, tenant_id")
    .eq("id", adjustmentId)
    .single()

  if (!adj || adj.tenant_id !== tenantId) throw new InvError("INV_ADJ_NOT_FOUND", "Adjustment not found", 404)
  if (adj.status !== "pending_approval") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot reject with status '${adj.status}'`, 400)
  }

  const { data: updated } = await supabase
    .from("inv_adjustments")
    .update({ status: "rejected", rejection_reason: rejectionReason })
    .eq("id", adjustmentId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_adjustments", recordId: adjustmentId,
    action: "adjustment_rejected", performedBy: userId,
    oldStatus: "pending_approval", newStatus: "rejected",
  })

  return updated
}

// ── Stocktake Service ───────────────────────────────────────────────────────────

export async function createStocktake(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  data: StocktakeCreate,
) {
  const { count } = await supabase
    .from("inv_stocktakes")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
  const seq = String((count ?? 0) + 1).padStart(4, "0")
  const stocktakeNumber = `ST-${seq}`

  const { data: stocktake, error: stErr } = await supabase
    .from("inv_stocktakes")
    .insert({
      tenant_id: tenantId,
      stocktake_number: stocktakeNumber,
      project_id: data.project_id,
      store_id: data.store_id,
      status: "open",
      initiated_by: userId,
      notes: data.notes ?? null,
    })
    .select()
    .single()

  if (stErr || !stocktake) {
    throw new InvError("INV_ST_CREATE_FAILED", stErr?.message ?? "Failed to create stocktake", 500)
  }

  const { data: stockRows } = await supabase
    .from("inv_stock")
    .select("item_id, quantity_available, unit_cost_fifo")
    .eq("store_id", data.store_id)

  const lines = (stockRows ?? []).map(s => ({
    tenant_id: tenantId,
    stocktake_id: stocktake.id,
    item_id: s.item_id,
    system_quantity: s.quantity_available,
    counted_quantity: null,
    variance: null,
    variance_percent: null,
    unit_cost: s.unit_cost_fifo,
    variance_value: null,
    is_approved: false,
  }))

  if (lines.length > 0) {
    const { error: linesErr } = await supabase.from("inv_stocktake_lines").insert(lines)
    if (linesErr) {
      throw new InvError("INV_ST_LINES_FAILED", linesErr.message, 500)
    }
  }

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_stocktakes", recordId: stocktake.id,
    action: "stocktake_created", performedBy: userId,
    newStatus: "open",
  })

  return stocktake
}

export async function startCountingStocktake(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  stocktakeId: string,
) {
  const { data: st } = await supabase
    .from("inv_stocktakes")
    .select("id, status, tenant_id")
    .eq("id", stocktakeId)
    .single()

  if (!st || st.tenant_id !== tenantId) throw new InvError("INV_ST_NOT_FOUND", "Stocktake not found", 404)
  if (st.status !== "open") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot start counting with status '${st.status}'`, 400)
  }

  const { data: updated } = await supabase
    .from("inv_stocktakes")
    .update({ status: "counting" })
    .eq("id", stocktakeId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_stocktakes", recordId: stocktakeId,
    action: "stocktake_started", performedBy: userId,
    oldStatus: "open", newStatus: "counting",
  })

  return updated
}

export async function updateStocktakeLineCount(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  lineId: string,
  countedQuantity: number,
  explanation?: string | null,
) {
  const { data: line } = await supabase
    .from("inv_stocktake_lines")
    .select("*, inv_stocktakes!inner(tenant_id, status)")
    .eq("id", lineId)
    .single()

  if (!line) throw new InvError("INV_ST_LINE_NOT_FOUND", "Stocktake line not found", 404)

  const st = line.inv_stocktakes as { tenant_id: string; status: string }
  if (st.tenant_id !== tenantId) throw new InvError("INV_ST_NOT_FOUND", "Stocktake not found", 404)
  if (st.status !== "counting") {
    throw new InvError("INV_INVALID_TRANSITION", "Can only update counts during counting phase", 400)
  }

  const sysQty = line.system_quantity
  const variance = +(countedQuantity - sysQty).toFixed(4)
  const variancePercent = sysQty !== 0 ? +((variance / sysQty) * 100).toFixed(4) : 0
  const varianceValue = line.unit_cost ? +(variance * line.unit_cost).toFixed(2) : null

  const { data: updated } = await supabase
    .from("inv_stocktake_lines")
    .update({
      counted_quantity: countedQuantity,
      variance,
      variance_percent: variancePercent,
      variance_value: varianceValue,
      explanation: explanation ?? null,
    })
    .eq("id", lineId)
    .select()
    .single()

  return updated
}

export async function submitStocktakeForApproval(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  stocktakeId: string,
) {
  const { data: st } = await supabase
    .from("inv_stocktakes")
    .select("id, status, tenant_id")
    .eq("id", stocktakeId)
    .single()

  if (!st || st.tenant_id !== tenantId) throw new InvError("INV_ST_NOT_FOUND", "Stocktake not found", 404)
  if (st.status !== "counting") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot submit with status '${st.status}'`, 400)
  }

  const { data: updated } = await supabase
    .from("inv_stocktakes")
    .update({ status: "pending_approval" })
    .eq("id", stocktakeId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_stocktakes", recordId: stocktakeId,
    action: "stocktake_submitted", performedBy: userId,
    oldStatus: "counting", newStatus: "pending_approval",
  })

  return updated
}

export async function approveStocktakeLine(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  lineId: string,
) {
  const { data: line } = await supabase
    .from("inv_stocktake_lines")
    .select("*, inv_stocktakes!inner(tenant_id, status)")
    .eq("id", lineId)
    .single()

  if (!line) throw new InvError("INV_ST_LINE_NOT_FOUND", "Stocktake line not found", 404)

  const st = line.inv_stocktakes as { tenant_id: string; status: string }
  if (st.tenant_id !== tenantId) throw new InvError("INV_ST_NOT_FOUND", "Stocktake not found", 404)
  if (st.status !== "pending_approval") {
    throw new InvError("INV_INVALID_TRANSITION", "Can only approve lines during pending_approval phase", 400)
  }

  const { data: updated } = await supabase
    .from("inv_stocktake_lines")
    .update({ is_approved: true, approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", lineId)
    .select()
    .single()

  return updated
}

export async function completeStocktake(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  stocktakeId: string,
) {
  const { data: st } = await supabase
    .from("inv_stocktakes")
    .select("*, inv_stocktake_lines(*)")
    .eq("id", stocktakeId)
    .single()

  if (!st || st.tenant_id !== tenantId) throw new InvError("INV_ST_NOT_FOUND", "Stocktake not found", 404)
  if (st.status !== "pending_approval") {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot complete with status '${st.status}'`, 400)
  }

  const lines = st.inv_stocktake_lines as Array<{
    id: string; item_id: string; system_quantity: number;
    counted_quantity: number | null; variance: number | null;
    unit_cost: number | null; variance_value: number | null
  }>

  let totalVarianceValue = 0

  for (const line of lines) {
    const counted = line.counted_quantity ?? line.system_quantity
    const variance = counted - line.system_quantity
    if (Math.abs(variance) < 0.0001) continue

    totalVarianceValue += line.variance_value ?? 0

    const { data: adj } = await supabase
      .from("inv_adjustments")
      .insert({
        tenant_id: tenantId,
        adjustment_number: `ADJ-${st.stocktake_number}`,
        project_id: st.project_id,
        store_id: st.store_id,
        reason_code: "stocktake_reconciliation",
        reason_description: `Stocktake ${st.stocktake_number} reconciliation`,
        status: "approved",
        requested_by: st.initiated_by,
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (adj) {
      await supabase.from("inv_adjustment_lines").insert({
        tenant_id: tenantId,
        adjustment_id: adj.id,
        item_id: line.item_id,
        quantity_before: line.system_quantity,
        quantity_adjusted: variance,
        quantity_after: counted,
        unit_cost: line.unit_cost,
        cost_impact: line.variance_value,
      })
    }

    const { data: stock } = await supabase
      .from("inv_stock")
      .select("id, quantity_available")
      .eq("store_id", st.store_id)
      .eq("item_id", line.item_id)
      .maybeSingle()

    if (stock) {
      await supabase.from("inv_stock").update({
        quantity_available: counted,
        last_movement_at: new Date().toISOString(),
      }).eq("id", stock.id)
    } else {
      await supabase.from("inv_stock").insert({
        tenant_id: tenantId, store_id: st.store_id, item_id: line.item_id,
        project_id: st.project_id, quantity_available: counted,
        quantity_reserved: 0, quantity_under_inspection: 0, quantity_quarantined: 0,
        unit_cost_fifo: line.unit_cost ?? 0, last_movement_at: new Date().toISOString(),
      })
    }

    await supabase.from("inv_movements").insert({
      tenant_id: tenantId, project_id: st.project_id, store_id: st.store_id,
      item_id: line.item_id, movement_type: "stocktake_adjustment",
      reference_type: "stocktake", reference_id: st.id,
      reference_number: st.stocktake_number,
      quantity: variance,
      unit_cost: line.unit_cost ?? 0,
      total_cost: line.variance_value ?? 0,
      balance_after: counted,
      movement_date: new Date().toISOString().split("T")[0],
      created_by: userId,
    })
  }

  const { data: updated } = await supabase
    .from("inv_stocktakes")
    .update({
      status: "completed",
      completed_by: userId,
      completed_at: new Date().toISOString(),
      total_variance_value: totalVarianceValue,
    })
    .eq("id", stocktakeId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_stocktakes", recordId: stocktakeId,
    action: "stocktake_completed", performedBy: userId,
    oldStatus: "pending_approval", newStatus: "completed",
  })

  return updated
}

export async function cancelStocktake(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  stocktakeId: string,
  reason?: string,
) {
  const { data: st } = await supabase
    .from("inv_stocktakes")
    .select("id, status, tenant_id")
    .eq("id", stocktakeId)
    .single()

  if (!st || st.tenant_id !== tenantId) throw new InvError("INV_ST_NOT_FOUND", "Stocktake not found", 404)
  if (["completed", "cancelled"].includes(st.status)) {
    throw new InvError("INV_INVALID_TRANSITION", `Cannot cancel with status '${st.status}'`, 400)
  }

  const updateData: Record<string, unknown> = { status: "cancelled" }
  if (reason) updateData.notes = reason

  const { data: updated } = await supabase
    .from("inv_stocktakes")
    .update(updateData)
    .eq("id", stocktakeId)
    .select()
    .single()

  await logInvAudit(supabase, {
    tenantId, tableName: "inv_stocktakes", recordId: stocktakeId,
    action: "stocktake_cancelled", performedBy: userId,
    oldStatus: st.status, newStatus: "cancelled",
  })

  return updated
}
