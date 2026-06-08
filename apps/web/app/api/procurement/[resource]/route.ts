import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

const ALLOWED_RESOURCES = [
  "procurement_suppliers",
  "procurement_prs",
  "procurement_pr_items",
  "procurement_pos",
  "procurement_po_items",
  "procurement_rfqs",
  "procurement_rfq_suppliers",
  "procurement_quotations",
  "procurement_quotation_items",
  "procurement_delivery_notes",
  "procurement_goods_receipts",
  "procurement_invoice_matches",
  "procurement_notifications",
  "procurement_audit_log",
  "procurement_inventory",
  "qs_boq_sections",
  "qs_boq_items",
  "qs_budget_revisions",
  "qs_cost_transactions",
  "qs_cost_items",
  "qs_cost_sections",
  "qs_cost_divisions",
  "account_coa",
  "account_ap_invoices",
  "account_ar_invoices",
  "account_payment_vouchers",
  "account_pv_links",
  "account_financial_periods",
  "account_journal_entries",
  "account_journal_lines",
  "account_bank_accounts",
  "account_payment_runs",
  "account_payment_run_items",
  "account_withholding_tax",
  "account_cash_forecast",
  "design_drawings",
  "design_rfi",
  "design_review_comments",
  "design_coordination_log",
  "design_arc_room_data",
  "design_arc_door_schedule",
  "design_arc_window_schedule",
  "design_arc_finish_schedule",
  "design_arc_material_approval",
  "design_str_calc_notes",
  "design_str_model_register",
  "design_str_rebar_review",
  "design_str_technical_queries",
  "design_str_design_changes",
  "design_mep_equipment",
  "design_mep_load_schedule",
  "design_mep_sleeve_coordination",
  "design_mep_material_submittal",
  "design_mep_commissioning",
  "site_daily_reports",
  "site_manpower",
  "site_equipment",
  "site_progress_photos",
  "inspection_requests",
  "ncrs",
  "plan_calendars",
  "plan_calendar_exceptions",
  "hse_permits",
  "hse_toolbox_talks",
  "hse_incidents",
  "hse_risk_assessments",
  "hse_observations",
  "document_audit_log",
  "document_viewers",
  "document_revision_task_links",
  "report_schedules",
  "report_logs",
  "kpi_snapshots",
  "subcontracts",
  "subcontract_items",
  "subcontract_ipcs",
  "subcontract_ipc_items",
  "subcontract_back_charges",
  "subcontract_performance_notices",
  "subcontract_variations",
  "currencies",
  "exchange_rates",
  "fx_transactions",
  "currency_exposure_ledger",
  "contract_register",
  "contract_employer_instructions",
  "contractual_notices",
  "entitlement_register",
  "contract_correspondence",
  "drawing_markups",
  "markup_annotations",
  "redline_layers",
  "markup_assignments",
  "mobile_device_registrations",
  "mobile_sync_sessions",
  "mobile_sync_queue",
  "mobile_sync_conflicts",
  "tender_register",
  "tender_invitations",
  "tender_addenda",
  "tender_queries",
  "tender_submissions",
  "tender_submission_items",
  "unit_rate_library",
  "tender_boq_items",
  "tender_sub_quotes",
  "tender_risk_items",
  "tender_bid_summaries",
  "bid_evaluations",
  "bid_evaluation_scores",
  "tender_award_records",
  "tender_win_loss",
] as const;

type Resource = (typeof ALLOWED_RESOURCES)[number];

function isResource(val: string): val is Resource {
  return ALLOWED_RESOURCES.includes(val as Resource);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  const { resource } = await params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 400 });
  }

  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const query = supabase.from(resource).select(searchParams.get("select") || "*");

  const orderCol = searchParams.get("order");
  if (orderCol) query.order(orderCol, { ascending: searchParams.get("asc") !== "false" });

  const limit = searchParams.get("limit");
  if (limit) query.limit(parseInt(limit, 10));

  const offset = searchParams.get("offset");
  if (offset) query.range(parseInt(offset, 10), parseInt(offset, 10) + 99);

  const eqCol = searchParams.get("eq");
  const eqVal = searchParams.get("eq_val");
  if (eqCol && eqVal) query.eq(eqCol, eqVal);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  const { resource } = await params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 400 });
  }

  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const body = await request.json();
  const records = Array.isArray(body) ? body : [body];

  const { data, error } = await supabase.from(resource).insert(records).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  const { resource } = await params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 400 });
  }

  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Query parameter 'id' is required for PUT" }, { status: 400 });

  const body = await request.json();
  const { data, error } = await supabase.from(resource).update(body).eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  const { resource } = await params;
  if (!isResource(resource)) {
    return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 400 });
  }

  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Query parameter 'id' is required for DELETE" }, { status: 400 });

  const { error } = await supabase.from(resource).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
