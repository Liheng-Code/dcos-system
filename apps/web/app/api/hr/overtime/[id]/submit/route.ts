import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { resolveApprovalChain } from "@/lib/hr/approval-chain";

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

  const { data: ot, error: fetchError } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !ot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ot.status !== "draft" && ot.status !== "needs_revision") {
    return NextResponse.json({ error: "Only draft or needs_revision requests can be submitted" }, { status: 400 });
  }

  if (ot.employee_id !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("level")
      .eq("id", user.id)
      .single();
    const isHR = profile?.level && ["HR_Manager", "HR_Admin", "HR_Officer", "Super_Admin", "Admin"].includes(profile.level);
    if (!isHR) {
      return NextResponse.json({ error: "Only the employee or HR can submit this request" }, { status: 403 });
    }
  }

  // ── Limit enforcement (§16-18) ─────────────────────────────────────────────
  const { data: limits } = await supabase
    .from("overtime_limits")
    .select("*")
    .eq("is_active", true);

  const limitMap: Record<string, { max_hours: number; escalation_required: boolean }> = {};
  limits?.forEach((l: any) => { limitMap[l.limit_type] = l; });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const getWeekRange = () => {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { from: monday.toISOString(), to: sunday.toISOString() };
  };

  const weekRange = getWeekRange();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [dailyResult, weeklyResult, monthlyResult] = await Promise.all([
    supabase
      .from("overtime_requests")
      .select("hours")
      .eq("employee_id", ot.employee_id)
      .in("status", ["submitted", "approved", "in_progress", "completed", "verified", "paid"])
      .gte("start_time", todayStart)
      .lte("start_time", todayEnd),
    supabase
      .from("overtime_requests")
      .select("hours")
      .eq("employee_id", ot.employee_id)
      .in("status", ["submitted", "approved", "in_progress", "completed", "verified", "paid"])
      .gte("start_time", weekRange.from)
      .lte("start_time", weekRange.to),
    supabase
      .from("overtime_requests")
      .select("hours")
      .eq("employee_id", ot.employee_id)
      .in("status", ["submitted", "approved", "in_progress", "completed", "verified", "paid"])
      .gte("start_time", monthStart)
      .lte("start_time", monthEnd),
  ]);

  const sumHours = (rows: any[] | null) => rows?.reduce((s: number, r: any) => s + (r.hours || 0), 0) ?? 0;
  const dailyTotal = sumHours(dailyResult.data) + ot.hours;
  const weeklyTotal = sumHours(weeklyResult.data) + ot.hours;
  const monthlyTotal = sumHours(monthlyResult.data) + ot.hours;

  const violations: string[] = [];
  let needsEscalation = false;

  if (limitMap.daily && dailyTotal > limitMap.daily.max_hours) {
    violations.push(`Daily limit of ${limitMap.daily.max_hours}h exceeded (${dailyTotal}h)`);
    if (limitMap.daily.escalation_required) needsEscalation = true;
  }
  if (limitMap.weekly && weeklyTotal > limitMap.weekly.max_hours) {
    violations.push(`Weekly limit of ${limitMap.weekly.max_hours}h exceeded (${weeklyTotal}h)`);
    if (limitMap.weekly.escalation_required) needsEscalation = true;
  }
  if (limitMap.monthly && monthlyTotal > limitMap.monthly.max_hours) {
    violations.push(`Monthly limit of ${limitMap.monthly.max_hours}h exceeded (${monthlyTotal}h)`);
    if (limitMap.monthly.escalation_required) needsEscalation = true;
  }

  // ── Resubmission: clear old approvals ──────────────────────────────────────
  if (ot.status === "needs_revision") {
    await supabase
      .from("overtime_approvals")
      .delete()
      .eq("ot_request_id", id);
  }

  // ── Approval chain resolution ──────────────────────────────────────────────
  const chain = await resolveApprovalChain(supabase, ot.employee_id);

  const approvals: { approver_id: string; approver_level: number; label: string; status: string }[] = [];
  if (chain.firstApprover?.id) {
    approvals.push({
      approver_id: chain.firstApprover.id,
      approver_level: 1,
      label: "Manager",
      status: "pending",
    });
  }
  if (chain.finalApprover?.id && chain.finalApprover.id !== chain.firstApprover?.id) {
    approvals.push({
      approver_id: chain.finalApprover.id,
      approver_level: 2,
      label: "HR",
      status: "waiting",
    });
  }

  if (needsEscalation) {
    const { data: escalationApprover } = await supabase
      .from("profiles")
      .select("id")
      .in("level", ["HR_Manager", "Super_Admin", "Admin"])
      .limit(1)
      .maybeSingle();
    if (escalationApprover?.id) {
      approvals.push({
        approver_id: escalationApprover.id,
        approver_level: 3,
        label: "Final",
        status: "waiting",
      });
    }
  }

  // Store the full planned chain as JSONB on the request (Issue 3)
  const plannedLevels = approvals.map(a => ({
    approver_id: a.approver_id,
    approver_level: a.approver_level,
    label: a.label,
  }));

  // ── Persist ────────────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("overtime_requests")
    .update({ status: "submitted", submitted_at: now.toISOString(), planned_levels: plannedLevels })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Only create level 1 as pending; higher levels are created on approve
  const level1Only = approvals.filter(a => a.approver_level === 1);
  if (level1Only.length > 0) {
    const { error: insError } = await supabase
      .from("overtime_approvals")
      .insert(level1Only.map(a => ({ ...a, ot_request_id: id })));

    if (insError) {
      return NextResponse.json({ error: insError.message }, { status: 500 });
    }
  }

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "submitted",
    performed_by: user.id,
    details: { approvals_count: approvals.length, violations: violations.length > 0 ? violations : undefined },
  });

  // Notify only level 1 approver
  const level1Approver = level1Only[0];
  if (level1Approver) {
    const { data: rec } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", level1Approver.approver_id)
      .single();

    if (rec) {
      await supabase.from("overtime_notifications").insert({
        ot_request_id: id,
        event_type: "request_submitted",
        recipient_id: level1Approver.approver_id,
        recipient_email: rec.email,
        recipient_name: rec.full_name,
        subject: "New Overtime Request Requires Your Approval",
        body: `Overtime request has been submitted${violations.length > 0 ? " (limit warnings: " + violations.join("; ") + ")" : ""} and requires your review.`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    status: "submitted",
    approvals_created: 1,
    total_planned: plannedLevels.length,
    warnings: violations.length > 0 ? violations : undefined,
    escalation: needsEscalation,
  });
}
