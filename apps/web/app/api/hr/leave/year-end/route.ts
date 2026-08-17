import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
  join_date: string | null;
  gender?: string | null;
  status?: string | null;
}

interface LeaveTypeRow {
  id: string;
  leave_code: string | null;
  leave_name: string | null;
  carryover_allowed: boolean | null;
  max_carryover: number | string | null;
  max_days_per_year: number | string | null;
  seniority_based: boolean | null;
  is_active?: boolean | null;
  gender_restriction?: string | null;
  rounding_rule: string | null;
  carryover_expiry_month: number | null;
  carryover_expiry_day: number | null;
}

interface BalanceRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  fiscal_year: number;
  allocated_days: number | string | null;
  used_days: number | string | null;
  remaining_days: number | string | null;
  carried_over_days: number | string | null;
  profiles: ProfileRow | ProfileRow[] | null;
  leave_types: LeaveTypeRow | LeaveTypeRow[] | null;
}

interface SeniorityRuleRow {
  id: string;
  leave_type_id: string;
  min_years: number | string;
  max_years: number | string | null;
  days_per_year: number | string;
}

interface LeaveUsageRow {
  employee_id: string;
  leave_type_id: string;
  days_requested: number | string | null;
}

interface PreviewRow {
  employee_id: string;
  employee_name: string;
  department: string;
  leave_type_id: string;
  leave_type_name: string;
  current_used: number;
  current_remaining: number;
  service_years: number | null;
  entitlement_days: number;
  carry_forward: number;
  expired_days: number;
  opening_balance: number;
  rule_id: string | null;
  notes: string;
  blocking_reason: string | null;
  warning_reason: string | null;
  existing_next_year_balance: boolean;
  carryover_expiry_date: string | null;
}

interface YearEndSourceRow {
  employeeId: string;
  leaveTypeId: string;
  profile: ProfileRow | null;
  leaveType: LeaveTypeRow | null;
  currentUsed: number;
  currentRemaining: number;
  generatedFromBalance: boolean;
}

const ADMIN_LEVELS = ["HR_Manager", "HR_Admin", "Super_Admin", "Admin"];
const ADMIN_ROLES = ["admin", "HR_Manager", "hr_manager"];
const ADMIN_ROLE_CODES = ["admin", "HR_Manager"];

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyRounding(value: number, rule: string | null | undefined): number {
  switch (rule) {
    case "nearest_half":
      return Math.round(value * 2) / 2;
    case "nearest_whole":
      return Math.round(value);
    case "round_up":
      return Math.ceil(value);
    case "round_down":
      return Math.floor(value);
    default:
      return value;
  }
}

function formatDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function serviceYears(joinDate: string, closingYear: number) {
  const joined = new Date(`${joinDate}T00:00:00`);
  const closing = new Date(closingYear, 11, 31);
  let years = closing.getFullYear() - joined.getFullYear();
  const closingMonthDay = (closing.getMonth() + 1) * 100 + closing.getDate();
  const joinedMonthDay = (joined.getMonth() + 1) * 100 + joined.getDate();
  if (closingMonthDay < joinedMonthDay) years -= 1;
  return Math.max(years, 0);
}

async function requireHrAdmin() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401, supabase: null, userId: null };

  const supabase = createAdminClient();
  const [profileRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("role, level").eq("id", user.id).single(),
    supabase.from("user_roles").select("role_code").eq("user_id", user.id),
  ]);

  const profile = profileRes.data as { role?: string | null; level?: string | null } | null;
  const roleCodes = ((rolesRes.data ?? []) as { role_code: string | null }[]).map((role) => role.role_code);
  const canManage =
    (profile?.role != null && ADMIN_ROLES.includes(profile.role)) ||
    (profile?.level != null && ADMIN_LEVELS.includes(profile.level)) ||
    roleCodes.some((roleCode) => roleCode != null && ADMIN_ROLE_CODES.includes(roleCode));

  if (!canManage) {
    return { error: "Only admin or HR admin can run year-end processing", status: 403, supabase: null, userId: null };
  }

  return { error: null, status: 200, supabase, userId: user.id };
}

function findRule(rules: SeniorityRuleRow[], leaveTypeId: string, years: number) {
  return rules.find((rule) => {
    const minYears = numeric(rule.min_years);
    const maxYears = rule.max_years == null ? null : numeric(rule.max_years);
    return rule.leave_type_id === leaveTypeId && years >= minYears && (maxYears == null || years <= maxYears);
  }) ?? null;
}

function leaveTypeAppliesToProfile(leaveType: LeaveTypeRow, profile: ProfileRow) {
  const restriction = leaveType.gender_restriction ?? "all";
  if (restriction === "all") return true;
  if (!profile.gender) return false;
  return restriction === profile.gender;
}

function includeLeaveTypeInGeneratedPreview(leaveType: LeaveTypeRow) {
  if (leaveType.is_active === false) return false;
  return leaveType.seniority_based === true || numeric(leaveType.max_days_per_year) > 0 || leaveType.carryover_allowed === true;
}

async function buildPreview(supabase: ReturnType<typeof createAdminClient>, currentYear: number) {
  const nextYear = currentYear + 1;
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const [balancesRes, rulesRes, profilesRes, leaveTypesRes, usageRes, existingLogsRes, existingBalancesRes] = await Promise.all([
    supabase
      .from("leave_balances")
      .select(`
        id, employee_id, leave_type_id, fiscal_year, allocated_days, used_days, remaining_days, carried_over_days,
        profiles(id, full_name, email, department, join_date, gender, status),
        leave_types(id, leave_code, leave_name, carryover_allowed, max_carryover, max_days_per_year, seniority_based, is_active, gender_restriction, rounding_rule, carryover_expiry_month, carryover_expiry_day)
      `)
      .eq("fiscal_year", currentYear),
    supabase
      .from("leave_seniority_rules")
      .select("id, leave_type_id, min_years, max_years, days_per_year")
      .order("min_years"),
    supabase
      .from("profiles")
      .select("id, full_name, email, department, join_date, gender, status")
      .order("full_name"),
    supabase
      .from("leave_types")
      .select("id, leave_code, leave_name, carryover_allowed, max_carryover, max_days_per_year, seniority_based, is_active, gender_restriction, rounding_rule, carryover_expiry_month, carryover_expiry_day")
      .order("leave_name"),
    supabase
      .from("leave_requests")
      .select("employee_id, leave_type_id, days_requested")
      .eq("status", "approved")
      .lte("start_date", yearEnd)
      .gte("end_date", yearStart),
    supabase
      .from("leave_year_end_logs")
      .select("id")
      .eq("from_year", currentYear)
      .eq("to_year", nextYear)
      .limit(1),
    supabase
      .from("leave_balances")
      .select("employee_id, leave_type_id")
      .eq("fiscal_year", nextYear)
  ]);

  if (balancesRes.error) throw new Error(balancesRes.error.message);
  if (rulesRes.error) throw new Error(rulesRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (leaveTypesRes.error) throw new Error(leaveTypesRes.error.message);
  if (usageRes.error) throw new Error(usageRes.error.message);
  if (existingLogsRes.error) throw new Error(existingLogsRes.error.message);
  if (existingBalancesRes.error) throw new Error(existingBalancesRes.error.message);

  const balances = (balancesRes.data ?? []) as BalanceRow[];
  const rules = (rulesRes.data ?? []) as SeniorityRuleRow[];
  const seniorityRuleLeaveTypeIds = new Set(rules.map((rule) => rule.leave_type_id));
  const profiles = ((profilesRes.data ?? []) as ProfileRow[]).filter((profile) => profile.status == null || profile.status === "active");
  const leaveTypes = ((leaveTypesRes.data ?? []) as LeaveTypeRow[]).filter(includeLeaveTypeInGeneratedPreview);
  const usageMap = new Map<string, number>();
  for (const usage of (usageRes.data ?? []) as LeaveUsageRow[]) {
    const key = `${usage.employee_id}:${usage.leave_type_id}`;
    usageMap.set(key, (usageMap.get(key) ?? 0) + numeric(usage.days_requested));
  }
  const hasExistingLogs = (existingLogsRes.data?.length ?? 0) > 0;
  const hasNextYearBalances = (existingBalancesRes.data?.length ?? 0) > 0;
  const existingNextYearBalanceKeys = new Set(
    ((existingBalancesRes.data ?? []) as { employee_id: string; leave_type_id: string }[])
      .map((balance) => `${balance.employee_id}:${balance.leave_type_id}`),
  );

  const balanceMap = new Map(
    balances.map((balance) => [`${balance.employee_id}:${balance.leave_type_id}`, balance]),
  );

  const sourceRows: YearEndSourceRow[] = profiles.flatMap((profile) =>
    leaveTypes
      .filter((leaveType) => leaveTypeAppliesToProfile(leaveType, profile))
      .map((leaveType) => {
        const key = `${profile.id}:${leaveType.id}`;
        const balance = balanceMap.get(key);
        return {
          employeeId: profile.id,
          leaveTypeId: leaveType.id,
          profile,
          leaveType,
          currentUsed: balance ? numeric(balance.used_days) : usageMap.get(key) ?? 0,
          currentRemaining: balance ? numeric(balance.remaining_days) : 0,
          generatedFromBalance: Boolean(balance),
        };
      }),
  );

  const rows: PreviewRow[] = sourceRows.map((source) => {
    const profile = source.profile;
    const leaveType = source.leaveType;
    const currentUsed = source.currentUsed;
    const hasConfiguredSeniorityRules = seniorityRuleLeaveTypeIds.has(source.leaveTypeId);
    const seniorityBased = leaveType?.seniority_based === true || hasConfiguredSeniorityRules;
    const years = profile?.join_date ? serviceYears(profile.join_date, currentYear) : null;
    const rule = years != null ? findRule(rules, source.leaveTypeId, years) : null;
    const fixedEntitlement = numeric(leaveType?.max_days_per_year);
    const entitlementDays = applyRounding(rule ? numeric(rule.days_per_year) : fixedEntitlement, leaveType?.rounding_rule);
    const existingNextYearBalance = existingNextYearBalanceKeys.has(`${source.employeeId}:${source.leaveTypeId}`);
    const currentRemaining = source.generatedFromBalance
      ? source.currentRemaining
      : Math.max(entitlementDays - currentUsed, 0);
    const maxCarryover = numeric(leaveType?.max_carryover);
    const carryForward = applyRounding(
      leaveType?.carryover_allowed ? Math.min(currentRemaining, maxCarryover) : 0,
      leaveType?.rounding_rule,
    );
    const expiredDays = Math.max(currentRemaining - carryForward, 0);
    const carryoverExpiryDate =
      carryForward > 0 && leaveType?.carryover_expiry_month != null && leaveType?.carryover_expiry_day != null
        ? formatDate(nextYear, leaveType.carryover_expiry_month, leaveType.carryover_expiry_day)
        : null;
    const missingJoinDate = seniorityBased && !profile?.join_date;
    const missingRule = seniorityBased && years != null && !rule;
    const warningReason = missingJoinDate
      ? "Missing employee join date"
      : missingRule
        ? "No seniority rule matches service years"
        : null;
    const notes = [
      seniorityBased
        ? `Service Year: ${years ?? "N/A"}; Seniority Rule: ${rule ? `${rule.min_years}-${rule.max_years ?? "No limit"} years` : "Not matched"}; Entitlement: ${entitlementDays}${warningReason ? `; Warning: ${warningReason}; Fixed entitlement fallback applied` : ""}`
        : `Fixed Entitlement: ${entitlementDays}`,
      `Carry Forward: ${carryForward}`,
      `Expired: ${expiredDays}`,
      `Opening Balance ${nextYear}: ${entitlementDays + carryForward}`,
      existingNextYearBalance ? `Skipped: balance already exists for ${nextYear}` : `Will generate balance for ${nextYear}`,
      source.generatedFromBalance ? "Source: current-year balance" : "Source: generated from active employee, leave type, and approved leave usage",
    ].join("; ");

    return {
      employee_id: source.employeeId,
      employee_name: profile?.full_name || "Unknown",
      department: profile?.department || "-",
      leave_type_id: source.leaveTypeId,
      leave_type_name: leaveType?.leave_name || "Unknown",
      current_used: currentUsed,
      current_remaining: currentRemaining,
      service_years: years,
      entitlement_days: entitlementDays,
      carry_forward: carryForward,
      expired_days: expiredDays,
      opening_balance: entitlementDays + carryForward,
      rule_id: rule?.id ?? null,
      notes,
      blocking_reason: null,
      warning_reason: existingNextYearBalance
        ? `Next-year balance already exists`
        : warningReason,
      existing_next_year_balance: existingNextYearBalance,
      carryover_expiry_date: carryoverExpiryDate,
    };
  });

  const runnableRows = rows.filter((row) => row.blocking_reason == null && !row.existing_next_year_balance);

  return {
    currentYear,
    nextYear,
    canRun: runnableRows.length > 0,
    hasExistingLogs,
    hasNextYearBalances,
    runnableRows: runnableRows.length,
    rows,
    totals: {
      employees: new Set(rows.map((row) => row.employee_id)).size,
      balances: rows.length,
      entitlementDays: rows.reduce((sum, row) => sum + row.entitlement_days, 0),
      carryForward: rows.reduce((sum, row) => sum + row.carry_forward, 0),
      expiredDays: rows.reduce((sum, row) => sum + row.expired_days, 0),
      openingBalance: rows.reduce((sum, row) => sum + row.opening_balance, 0),
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (!auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const yearParam = request.nextUrl.searchParams.get("year");
  const currentYear = yearParam ? Number(yearParam) : new Date().getFullYear();
  if (!Number.isInteger(currentYear) || currentYear < 2000) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    return NextResponse.json(await buildPreview(auth.supabase, currentYear));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build year-end preview" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (!auth.supabase || !auth.userId) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({})) as { year?: number };
  const currentYear = body.year ?? new Date().getFullYear();
  if (!Number.isInteger(currentYear) || currentYear < 2000) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  try {
    const preview = await buildPreview(auth.supabase, currentYear);
    if (preview.rows.length === 0) {
      return NextResponse.json({ error: "No leave balances found for the selected year." }, { status: 400 });
    }
    const blocked = preview.rows.find((row) => row.blocking_reason != null);
    if (blocked) {
      return NextResponse.json({ error: `${blocked.employee_name} / ${blocked.leave_type_name}: ${blocked.blocking_reason}` }, { status: 400 });
    }
    const rowsToProcess = preview.rows.filter((row) => !row.existing_next_year_balance);
    if (rowsToProcess.length === 0) {
      return NextResponse.json({ error: "All next-year balances already exist for the selected staff." }, { status: 409 });
    }

    for (const row of rowsToProcess) {
      const { error: balanceError } = await auth.supabase
        .from("leave_balances")
        .insert({
          employee_id: row.employee_id,
          leave_type_id: row.leave_type_id,
          fiscal_year: preview.nextYear,
          allocated_days: row.entitlement_days,
          used_days: 0,
          carried_over_days: row.carry_forward,
          remaining_days: row.opening_balance,
          carryover_expiry_date: row.carryover_expiry_date,
        });

      if (balanceError) throw new Error(balanceError.message);

      const { error: logError } = await auth.supabase
        .from("leave_year_end_logs")
        .insert({
          from_year: preview.currentYear,
          to_year: preview.nextYear,
          employee_id: row.employee_id,
          leave_type_id: row.leave_type_id,
          days_used: row.current_used,
          days_remaining: row.current_remaining,
          days_carried: row.carry_forward,
          days_expired: row.expired_days,
          run_by: auth.userId,
          notes: row.notes,
        });

      if (logError) throw new Error(logError.message);
    }

    return NextResponse.json({
      success: true,
      message: `Year-end processing complete. ${rowsToProcess.length} balances generated for ${preview.nextYear}. ${preview.rows.length - rowsToProcess.length} existing balances skipped.`,
      preview,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Year-end processing failed" }, { status: 500 });
  }
}
