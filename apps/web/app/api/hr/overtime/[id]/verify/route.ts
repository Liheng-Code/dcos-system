import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

const OT_TYPE_TO_TS_MAP: Record<string, string> = {
  weekday: "1.5x",
  weekend: "2.0x",
  public_holiday: "holiday",
  night_shift: "2.0x",
  emergency: "1.5x",
  project_critical: "2.0x",
};

function getWeekStart(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

function getWeekEnd(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("level")
    .eq("id", user.id)
    .single();

  const canVerify = profile?.level && [
    "HR_Manager", "HR_Admin", "HR_Officer", "Payroll_Officer", "Super_Admin", "Admin",
  ].includes(profile.level);

  if (!canVerify) {
    return NextResponse.json({ error: "Only HR and Payroll can verify OT" }, { status: 403 });
  }

  const { data: ot, error: fetchError } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !ot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ot.status !== "approved" && ot.status !== "completed") {
    return NextResponse.json({ error: "Only approved or completed requests can be verified" }, { status: 400 });
  }

  const now = new Date();
  const otDateStr = ot.start_time.split("T")[0];

  // ── Get OT rate multiplier ─────────────────────────────────────────────────
  const { data: rate } = await supabase
    .from("overtime_rates")
    .select("multiplier")
    .eq("ot_type", ot.ot_type)
    .eq("is_active", true)
    .lte("effective_date", otDateStr)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const multiplier = rate ? parseFloat(String(rate.multiplier).replace(/[{}]/g, "").split(" ")[0]) : 1.5;

  // ── Calculate hourly rate from salary structure ────────────────────────────
  const { data: basicComponent } = await supabase
    .from("payroll_component_types")
    .select("id")
    .eq("code", "BASIC")
    .single();

  let hourlyRate = 0;
  if (basicComponent) {
    const { data: salary } = await supabase
      .from("employee_salary_structures")
      .select("amount")
      .eq("employee_id", ot.employee_id)
      .eq("component_type_id", basicComponent.id)
      .lte("effective_from", otDateStr)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (salary) {
      hourlyRate = parseFloat(salary.amount) / 26 / 8;
    }
  }

  const amount = ot.hours * hourlyRate * multiplier;

  // ── Update status ──────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("overtime_requests")
    .update({ status: "verified" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // ── Create overtime_payroll record ─────────────────────────────────────────
  const payrollMonth = otDateStr.substring(0, 7);

  const { error: payrollError } = await supabase
    .from("overtime_payroll")
    .insert({
      ot_request_id: id,
      employee_id: ot.employee_id,
      payroll_month: payrollMonth,
      hours: ot.hours,
      rate_multiplier: multiplier,
      hourly_rate: Math.round(hourlyRate * 100) / 100,
      amount: Math.round(amount * 100) / 100,
      status: "pending",
    });

  if (payrollError) {
    return NextResponse.json({ error: payrollError.message }, { status: 500 });
  }

  // ── Timesheet integration ──────────────────────────────────────────────────
  const weekStart = getWeekStart(new Date(otDateStr));
  const weekEnd = getWeekEnd(weekStart);
  const tsOtType = OT_TYPE_TO_TS_MAP[ot.ot_type] || "1.5x";

  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("id")
    .eq("employee_id", ot.employee_id)
    .eq("week_start_date", weekStart)
    .maybeSingle();

  let timesheetId: string;
  if (timesheet) {
    timesheetId = timesheet.id;
  } else {
    const { data: newTs, error: tsError } = await supabase
      .from("timesheets")
      .insert({
        employee_id: ot.employee_id,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        status: "approved",
        total_ot_hours: ot.hours,
      })
      .select("id")
      .single();

    if (tsError) {
      return NextResponse.json({ error: tsError.message }, { status: 500 });
    }
    timesheetId = newTs.id;
  }

  const { data: existingEntry } = await supabase
    .from("timesheet_entries")
    .select("id, ot_hours")
    .eq("timesheet_id", timesheetId)
    .eq("entry_date", otDateStr)
    .maybeSingle();

  if (existingEntry) {
    await supabase
      .from("timesheet_entries")
      .update({
        ot_type: tsOtType,
        ot_hours: (existingEntry.ot_hours || 0) + ot.hours,
        task_description: ot.reason,
      })
      .eq("id", existingEntry.id);
  } else {
    await supabase
      .from("timesheet_entries")
      .insert({
        timesheet_id: timesheetId,
        entry_date: otDateStr,
        project_id: ot.project_id,
        wbs_node_id: ot.wbs_node_id,
        task_description: ot.reason,
        hours_worked: 0,
        ot_type: tsOtType,
        ot_hours: ot.hours,
      });
  }

  // ── Update timesheet total_ot_hours ─────────────────────────────────────────
  const { data: allEntries } = await supabase
    .from("timesheet_entries")
    .select("ot_hours")
    .eq("timesheet_id", timesheetId);

  const totalOT = allEntries?.reduce((s: number, e: any) => s + (e.ot_hours || 0), 0) ?? ot.hours;
  await supabase
    .from("timesheets")
    .update({ total_ot_hours: totalOT })
    .eq("id", timesheetId);

  // ── Notifications + Audit ─────────────────────────────────────────────────
  await supabase.from("overtime_notifications").insert({
    ot_request_id: id,
    event_type: "request_verified",
    recipient_id: ot.employee_id,
    subject: "Your Overtime Has Been Verified",
    body: `Your overtime (${ot.hours}h) has been verified at ${multiplier}× rate. Estimated payout: $${Math.round(amount * 100) / 100}.`,
  });

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "verified",
    performed_by: user.id,
    details: {
      hours: ot.hours,
      multiplier,
      hourly_rate: hourlyRate,
      amount: Math.round(amount * 100) / 100,
      timesheet_id: timesheetId,
    },
  });

  return NextResponse.json({
    success: true,
    status: "verified",
    payroll: { hours: ot.hours, multiplier, hourly_rate: hourlyRate, amount: Math.round(amount * 100) / 100 },
    timesheet_id: timesheetId,
  });
}
