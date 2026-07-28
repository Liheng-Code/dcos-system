export interface InvStore {
  id: string
  store_code: string
  name: string
  project_id: string
  // inv_stores has no is_active column — active/closed is tracked via `status`.
  status: "active" | "closed"
  // Optional — present when fetched via the full store master query
  // (store-list.tsx / store-detail-page.tsx); omitted from the lighter
  // selects used by GRN/MR/Adjustment pickers.
  store_type?: "central" | "site" | "temporary" | "yard" | "dg"
  location_description?: string | null
  responsible_user_id?: string | null
  capacity_qty?: number | null
  capacity_uom?: string | null
  tenant_id?: string
  created_at?: string
}

export interface InvItem {
  id: string
  item_code: string
  name: string
  category: string
  unit_of_measure: string
  min_stock_level: number | null
  reorder_quantity: number | null
  is_inspection_required: boolean
  is_active: boolean
  // Optional — present when fetched via the full item master query
  // (item-list.tsx / item-form.tsx); omitted from the lighter selects
  // used elsewhere (GRN/MR/Adjustment item pickers).
  sub_category?: string | null
  default_cost_code?: string | null
  max_stock_level?: number | null
  lead_time_days?: number | null
  barcode?: string | null
  is_dg?: boolean
  is_batch_managed?: boolean
  shelf_life_days?: number | null
  tenant_id?: string
  created_at?: string
}

export interface StockRow {
  id: string
  store_id: string
  item_id: string
  project_id: string
  quantity_available: number
  quantity_reserved: number
  quantity_under_inspection: number
  quantity_quarantined: number
  unit_cost_fifo: number
  last_movement_at: string | null
  inv_items: {
    item_code: string
    name: string
    category: string
    unit_of_measure: string
    min_stock_level: number | null
    reorder_quantity: number | null
  }
}

export interface GrnRow {
  id: string
  grn_number: string
  project_id: string
  store_id: string
  po_id: string | null
  po_number: string
  supplier_id: string | null
  received_date: string
  status: "draft" | "confirmed" | "cancelled"
  created_at: string
  confirmed_at: string | null
  inv_grn_lines?: { count: number }[]
}

export interface GrnLineRow {
  id: string
  item_id: string
  po_item_id: string | null
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  total_cost: number
  batch_number: string | null
  inspection_required: boolean
  inspection_status: "not_required" | "pending" | "approved" | "rejected"
  condition_notes: string | null
  inv_items?: { item_code: string; name: string; unit_of_measure: string }
}

export interface MrRow {
  id: string
  mr_number: string
  project_id: string
  store_id: string
  wbs_node_id: string
  task_id: string | null
  cost_code: string
  required_date: string
  requested_by: string
  approved_by: string | null
  status: "draft" | "submitted" | "approved" | "partially_issued" | "issued" | "rejected" | "cancelled"
  rejection_reason: string | null
  created_at: string
  inv_mr_lines?: { count: number }[]
  profiles?: { full_name: string | null; email: string }
}

export interface MrLineRow {
  id: string
  item_id: string
  quantity_requested: number
  quantity_approved: number | null
  quantity_issued: number
  unit_cost_at_issue: number | null
  remarks: string | null
  inv_items?: { item_code: string; name: string; unit_of_measure: string }
}

export interface TransferRow {
  id: string
  transfer_number: string
  transfer_type: "intra_project" | "inter_project"
  source_project_id: string
  source_store_id: string
  destination_project_id: string
  destination_store_id: string
  status: "pending" | "approved" | "in_transit" | "received" | "discrepancy" | "resolved" | "rejected" | "cancelled"
  transfer_reason: string
  requested_by: string
  source_approved_by: string | null
  source_approved_at: string | null
  dest_approved_by: string | null
  dest_approved_at: string | null
  dispatched_by: string | null
  dispatched_at: string | null
  received_by: string | null
  received_at: string | null
  created_at: string
  inv_transfer_lines?: { count: number }[]
  source_store?: { name: string; store_code: string } | null
  destination_store?: { name: string; store_code: string } | null
  source_project?: { project_name: string; project_code: string } | null
  destination_project?: { project_name: string; project_code: string } | null
  profiles?: { full_name: string | null; email: string } | null
}

export interface TransferLineRow {
  id: string
  transfer_id: string
  item_id: string
  quantity_requested: number
  quantity_dispatched: number | null
  quantity_received: number | null
  unit_cost: number | null
  inv_items?: { item_code: string; name: string; unit_of_measure: string }
}

export interface AdjustmentRow {
  id: string
  adjustment_number: string
  project_id: string
  store_id: string
  reason_code: "damage" | "expiry" | "counting_error" | "theft_loss" | "correction" | "stocktake_reconciliation" | "write_off"
  reason_description: string
  status: "pending_approval" | "approved" | "rejected"
  requested_by: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  inv_adjustment_lines?: { count: number }[]
  profiles?: { full_name: string | null; email: string } | null
  inv_stores?: { name: string; store_code: string } | null
}

export interface AdjustmentLineRow {
  id: string
  adjustment_id: string
  item_id: string
  quantity_before: number
  quantity_adjusted: number
  quantity_after: number
  unit_cost: number | null
  cost_impact: number | null
  inv_items?: { item_code: string; name: string; unit_of_measure: string }
}

export interface StocktakeRow {
  id: string
  stocktake_number: string
  project_id: string
  store_id: string
  status: "open" | "counting" | "pending_approval" | "completed" | "cancelled"
  initiated_by: string
  initiated_at: string
  completed_by: string | null
  completed_at: string | null
  total_variance_value: number | null
  notes: string | null
  created_at: string
  inv_stocktake_lines?: { count: number }[]
  profiles?: { full_name: string | null; email: string } | null
  inv_stores?: { name: string; store_code: string } | null
}

export interface StocktakeLineRow {
  id: string
  stocktake_id: string
  item_id: string
  system_quantity: number
  counted_quantity: number | null
  variance: number | null
  variance_percent: number | null
  unit_cost: number | null
  variance_value: number | null
  is_approved: boolean
  explanation: string | null
  inv_items?: { item_code: string; name: string; unit_of_measure: string }
}

export const REASON_CODE_LABELS: Record<string, string> = {
  damage: "Damage",
  expiry: "Expiry",
  counting_error: "Counting Error",
  theft_loss: "Theft / Loss",
  correction: "Correction",
  stocktake_reconciliation: "Stock Take Reconciliation",
  write_off: "Write Off",
}

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  grn_receipt: "GRN Receipt",
  mr_issue: "Issue",
  return_to_store: "Return to Store",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  return_to_supplier: "Return to Supplier",
  adjustment: "Adjustment",
  stocktake_adjustment: "Stock Take",
  write_off: "Write Off",
}

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS)

export interface MovementRow {
  id: string
  item_id: string
  store_id: string
  movement_type: string
  reference_type: string
  reference_number: string
  quantity: number
  unit_cost: number
  total_cost: number
  wbs_node_id: string | null
  cost_code: string | null
  movement_date: string
  created_at: string
  inv_items?: { item_code: string; name: string; unit_of_measure: string }
}

export const INV_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  confirmed: "Confirmed",
  partially_issued: "Partially Issued",
  issued: "Issued",
  rejected: "Rejected",
  cancelled: "Cancelled",
  in_transit: "In Transit",
  received: "Received",
  discrepancy: "Discrepancy",
  open: "Open",
  counting: "Counting",
  pending_approval: "Pending Approval",
  completed: "Completed",
  pending: "Pending",
  resolved: "Resolved",
  // Returns (inv_returns.status)
  inspected: "Inspected",
  posted: "Posted",
  // Tools (inv_tools.status)
  available: "Available",
  maintenance: "Maintenance",
  disposed: "Disposed",
  // Tool issues (inv_tool_issues.status)
  overdue: "Overdue",
  returned: "Returned",
  damaged: "Damaged",
  lost: "Lost",
}

export const CATEGORIES = [
  { value: "structural", label: "Structural" },
  { value: "civil", label: "Civil" },
  { value: "mep", label: "MEP" },
  { value: "finishes", label: "Finishes" },
  { value: "consumables", label: "Consumables" },
  { value: "others", label: "Others" },
]

// ── Store / Location ────────────────────────────────────────────────────────

export interface LocationRow {
  id: string
  store_id: string
  parent_id: string | null
  code: string
  location_type: "zone" | "aisle" | "rack" | "bin"
  is_dg_allowed: boolean
  capacity_qty: number | null
  status: "active" | "inactive"
  tenant_id?: string
  created_at?: string
}

export const STORE_TYPE_LABELS: Record<string, string> = {
  central: "Central",
  site: "Site",
  temporary: "Temporary",
  yard: "Yard",
  dg: "Dangerous Goods (DG)",
}

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  zone: "Zone",
  aisle: "Aisle",
  rack: "Rack",
  bin: "Bin",
}

// ── Returns ──────────────────────────────────────────────────────────────────

export interface ReturnRow {
  id: string
  return_number: string
  project_id: string
  store_id: string
  mr_id: string | null
  return_date: string
  status: "draft" | "submitted" | "inspected" | "posted" | "cancelled"
  returned_by: string
  created_at: string
  inv_return_lines?: { count: number }[] | ReturnLineRow[]
  inv_stores?: { name: string; store_code: string } | null
  profiles?: { full_name: string | null; email: string } | null
}

export interface ReturnLineRow {
  id: string
  return_id: string
  item_id: string
  quantity: number
  condition: "good" | "damaged" | "scrap"
  unit_cost: number | null
  remarks: string | null
  inv_items?: { item_code: string; name: string; unit_of_measure: string }
}

export const RETURN_CONDITION_LABELS: Record<string, string> = {
  good: "Good",
  damaged: "Damaged",
  scrap: "Scrap",
}

// ── Tools ────────────────────────────────────────────────────────────────────

export interface ToolRow {
  id: string
  tool_code: string
  name: string
  serial_no: string | null
  category: string | null
  purchase_value: number | null
  is_restricted: boolean
  status: "available" | "issued" | "maintenance" | "lost" | "disposed"
  tenant_id?: string
  created_at?: string
}

export interface ToolIssueRow {
  id: string
  tool_id: string
  custodian_id: string
  project_id: string
  wbs_node_id: string | null
  issued_at: string
  due_date: string
  condition_out: string | null
  returned_at: string | null
  condition_in: "good" | "damaged" | "lost" | null
  status: "issued" | "overdue" | "returned" | "damaged" | "lost"
  created_at: string
  profiles?: { full_name: string | null; email: string } | null
  projects?: { project_code: string; project_name: string } | null
  wbs_nodes?: { wbs_code: string; wbs_name: string } | null
}

export const TOOL_CONDITION_LABELS: Record<string, string> = {
  good: "Good",
  damaged: "Damaged",
  lost: "Lost",
}
